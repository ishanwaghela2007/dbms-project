import { createClient } from 'redis';
import { logger } from './logger.js';

const redisUrl = process.env.REDIS_URL;
let connected = false;
let redisClient = null;

if (redisUrl || process.env.NODE_ENV !== 'production') {
  redisClient = createClient({
    url: redisUrl || 'redis://127.0.0.1:6379',
    socket: {
      reconnectStrategy: retries => {
        if (retries > 3 && !redisUrl) return false;
        return Math.min(retries * 500, 5000);
      }
    }
  });
  redisClient.on('error', err => {
    if (connected) logger.warn({ err: err.message }, 'Redis connection error');
  });
}

export const redis = redisClient;
export async function connectRedis() {
  if (!redis) {
    logger.info('REDIS_URL not configured; operating in local in-memory fallback mode');
    return false;
  }
  if (connected) return true;
  try {
    await redis.connect();
    connected = true;
    logger.info('Redis connected');
    return true;
  } catch (err) {
    logger.warn({ err: err.message }, 'Redis unavailable; running in fallback mode');
    return false;
  }
}
export function isRedisReady() { return connected && Boolean(redis?.isReady); }
export async function safeDelete(key) {
  try { if (isRedisReady()) await redis.del(key); }
  catch (err) { logger.warn({ key, err: err.message }, 'Redis invalidation failed'); }
}
export async function safeSet(key, value, options) {
  try { if (isRedisReady()) await redis.set(key, String(value), options); }
  catch (err) { logger.warn({ key, err: err.message }, 'Redis write failed'); }
}
