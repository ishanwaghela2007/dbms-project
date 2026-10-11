import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { rpc } from '../shared/grpc.js';
import { clients } from './clients.js';
import { redis, isRedisReady, safeDelete } from '../shared/redis.js';
import { logger } from '../shared/logger.js';

export function authenticate(req, res, next) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
  try {
    const decoded = jwt.verify(token, config.jwtSecret, { issuer: config.jwtIssuer, audience: config.jwtAudience });
    if (!decoded || typeof decoded !== 'object' || typeof decoded.sub !== 'string') return res.status(401).json({ error: 'Invalid token', code: 'UNAUTHENTICATED' });
    req.auth = { userId: decoded.sub };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token', code: 'UNAUTHENTICATED' });
  }
}

async function getAuthorization(userId) {
  const key = `authz:${userId}`;
  if (isRedisReady()) {
    try { const cached = await redis.get(key); if (cached) return JSON.parse(cached); }
    catch (err) { logger.warn({ err: err.message }, 'Authorization cache read failed; using Auth Service'); }
  }
  // Fail closed when the authoritative service cannot verify current status.
  const authorization = await rpc(clients.auth, 'getAuthorization', { userId });
  if (!authorization.found || !authorization.is_active) return authorization;
  if (isRedisReady()) {
    try { await redis.set(key, JSON.stringify(authorization), { EX: config.authzCacheTtl }); }
    catch (err) { logger.warn({ err: err.message }, 'Authorization cache write failed'); }
  }
  return authorization;
}

export function requireUser(allowedTypes = []) {
  return async (req, res, next) => {
    try {
      const authz = await getAuthorization(req.auth.userId);
      if (!authz?.found || !authz.is_active) return res.status(403).json({ error: 'Account is inactive or unavailable', code: 'FORBIDDEN' });
      req.user = authz;
      if (authz.is_admin) return next();
      if (allowedTypes.length && !allowedTypes.includes(authz.accountType)) return res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
      next();
    } catch (error) {
      logger.warn({ err: error.message }, 'Could not verify authorization');
      res.status(503).json({ error: 'Authorization service unavailable', code: 'AUTHORIZATION_UNAVAILABLE' });
    }
  };
}

export function requireAdmin(req, res, next) {
  requireUser([])(req, res, err => {
    if (err) return next(err);
    if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
    next();
  });
}
export function clearAuthorizationCache(userId) { return safeDelete(`authz:${userId}`); }
