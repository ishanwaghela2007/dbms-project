import { createClient } from 'redis';
import { logger } from './logger.js';

export const redis = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379', socket: { reconnectStrategy: retries => Math.min(retries * 200, 3000) } });
redis.on('error', err => logger.warn({ err: err.message }, 'Redis connection error'));
let connected = false;
export async function connectRedis() {
  if (connected) return true;
  try { await redis.connect(); connected = true; logger.info('Redis connected'); return true; }
  catch (err) { logger.warn({ err: err.message }, 'Redis unavailable; authorization uses Auth Service fallback'); return false; }
}
export function isRedisReady() { return connected && redis.isReady; }
export async function safeDelete(key) {
  try { if (isRedisReady()) await redis.del(key); }
  catch (err) { logger.warn({ key, err: err.message }, 'Redis invalidation failed; short TTL limits stale authorization'); }
}
