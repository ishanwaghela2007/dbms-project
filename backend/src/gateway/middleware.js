import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { redis, isRedisReady, safeDelete } from '../shared/redis.js';
import { logger } from '../shared/logger.js';

export async function authenticate(req, res, next) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
  try {
    const decoded = jwt.verify(token, config.jwtSecret, { issuer: config.jwtIssuer, audience: config.jwtAudience });
    if (!decoded || typeof decoded !== 'object' || typeof decoded.sub !== 'string' || decoded.active !== true || !['ADMIN','TEACHER','STUDENT'].includes(decoded.accountType) || !Number.isInteger(decoded.authVersion)) return res.status(401).json({ error: 'Invalid token claims', code: 'UNAUTHENTICATED' });
    if (isRedisReady()) {
      const currentVersion=await redis.get(`authz:version:${decoded.sub}`);
      if (currentVersion === 'invalidated' || (currentVersion && Number(currentVersion)!==decoded.authVersion)) return res.status(401).json({ error: 'Session has been revoked', code: 'UNAUTHENTICATED' });
    } else {
      // M-2 fix: Redis is unavailable — revocation cannot be checked. Log every occurrence so
      // ops can see the fail-open window. JWT TTL (15m) naturally bounds the exposure.
      logger.warn({ userId: decoded.sub, path: req.path }, 'Redis unavailable: token revocation check skipped (fail-open)');
    }
    req.auth = { userId: decoded.sub };
    req.user = { id:decoded.sub, email:decoded.email, fullName:decoded.fullName, accountType:decoded.accountType, is_admin:Boolean(decoded.isAdmin), is_active:true };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token', code: 'UNAUTHENTICATED' });
  }
}


export function requireUser(allowedTypes = []) {
  return (req, res, next) => {
    if (!req.user?.is_active) return res.status(403).json({ error: 'Account is inactive or unavailable', code: 'FORBIDDEN' });
    if (!req.user.is_admin && allowedTypes.length && !allowedTypes.includes(req.user.accountType)) return res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
    next();
  };
}

export function requireAdmin(req, res, next) {
  requireUser([])(req, res, err => {
    if (err) return next(err);
    if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
    next();
  });
}
export function clearAuthorizationCache(userId) { return safeDelete(`authz:version:${userId}`); }
