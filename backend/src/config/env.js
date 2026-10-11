import 'dotenv/config';

export function env(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function optionalEnv(name, fallback = '') {
  return process.env[name] ?? fallback;
}

export function intEnv(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export const config = {
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  jwtSecret: optionalEnv('JWT_SECRET', 'local-dev-only-change-this-secret-32-bytes-minimum'),
  jwtIssuer: optionalEnv('JWT_ISSUER', 'college-erp'),
  jwtAudience: optionalEnv('JWT_AUDIENCE', 'college-erp-api'),
  jwtAccessTtl: optionalEnv('JWT_ACCESS_TTL', '15m'),
  maxUploadMb: Number(optionalEnv('MAX_UPLOAD_MB', '10')),
  marksPdfMaxMb: Number(optionalEnv('MARKS_PDF_MAX_MB', '8')),
  lowAttendanceThreshold: Number(optionalEnv('LOW_ATTENDANCE_THRESHOLD', '75')),
  authzCacheTtl: Number(optionalEnv('AUTHZ_CACHE_TTL_SECONDS', '30')),
  grpcMaxMessageBytes: Number(optionalEnv('GRPC_MAX_MESSAGE_BYTES', String(16 * 1024 * 1024))),
  frontendOrigin: optionalEnv('FRONTEND_ORIGIN', 'http://localhost:3000'),
};

if (config.nodeEnv === 'production' && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must have at least 32 characters in production');
}
