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

const rawDatabaseUrl = optionalEnv('DATABASE_URL') || optionalEnv('MYSQL_URL') || optionalEnv('MYSQL_CONNECTION_STRING');
let parsedUrl = null;
if (rawDatabaseUrl) {
  try {
    parsedUrl = new URL(rawDatabaseUrl);
  } catch {}
}

const defaultHost = parsedUrl?.hostname || '127.0.0.1';
const defaultPort = parsedUrl?.port ? Number(parsedUrl.port) : 3306;
const defaultUser = parsedUrl?.username ? decodeURIComponent(parsedUrl.username) : 'erp_user';
const defaultPassword = parsedUrl?.password ? decodeURIComponent(parsedUrl.password) : 'change_me';
const defaultDatabase = (parsedUrl?.pathname ? parsedUrl.pathname.replace(/^\//, '').split('?')[0] : null) || optionalEnv('MYSQL_DATABASE', 'college_erp');
const isTiDBDetected = (defaultPort === 4000) || (defaultHost.includes('tidb')) || (parsedUrl?.searchParams?.has('ssl')) || (process.env.MYSQL_SSL === 'true');

function productionEnv(name, fallback = undefined) {
  if (process.env.NODE_ENV === 'production' && !process.env[name]) {
    if (fallback === undefined) {
      throw new Error(`Missing required production environment variable: ${name}`);
    }
  }
  return optionalEnv(name, fallback);
}

function positiveIntEnv(name, fallback) {
  const value = Number(optionalEnv(name, String(fallback)));
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function serviceEnv(name, fallback) {
  const serviceValue = process.env[`SERVICE_${name}`];
  if (serviceValue) return serviceValue;
  if (rawDatabaseUrl) return optionalEnv(name, fallback);
  return fallback !== undefined ? optionalEnv(name, fallback) : productionEnv(name, fallback);
}

function servicePositiveIntEnv(name, fallback) {
  const value = Number(serviceEnv(name, String(fallback)));
  if (!Number.isInteger(value) || value <= 0) throw new Error(`SERVICE_${name} or ${name} must be a positive integer`);
  return value;
}

const serviceDatabases = Object.freeze({
  gateway: 'college_erp_gateway', auth: 'college_erp_auth', profile: 'college_erp_profile',
  academic: 'college_erp_academic', attendance: 'college_erp_attendance', marks: 'college_erp_marks',
  paper: 'college_erp_paper', notification: 'college_erp_notification',
});
const configuredServiceName = optionalEnv('SERVICE_NAME', 'gateway');

export const config = {
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  serviceName: configuredServiceName,
  jwtSecret: productionEnv('JWT_SECRET', 'local-dev-only-change-this-secret-32-bytes-minimum'),
  serviceAuthSecret: productionEnv('SERVICE_AUTH_SECRET', 'local-dev-only-service-auth-secret-change-me'),
  serviceAuthTtl: optionalEnv('SERVICE_AUTH_TTL', '30s'),
  grpcSecurityMode: optionalEnv('GRPC_SECURITY_MODE', 'insecure'),
  grpcTlsCaPath: optionalEnv('GRPC_TLS_CA_PATH'),
  grpcTlsCertPath: optionalEnv('GRPC_TLS_CERT_PATH'),
  grpcTlsKeyPath: optionalEnv('GRPC_TLS_KEY_PATH'),
  jwtIssuer: optionalEnv('JWT_ISSUER', 'college-erp'),
  jwtAudience: optionalEnv('JWT_AUDIENCE', 'college-erp-api'),
  jwtAccessTtl: optionalEnv('JWT_ACCESS_TTL', '15m'),
  maxUploadMb: Number(optionalEnv('MAX_UPLOAD_MB', '10')),
  marksPdfMaxMb: Number(optionalEnv('MARKS_PDF_MAX_MB', '8')),
  lowAttendanceThreshold: Number(optionalEnv('LOW_ATTENDANCE_THRESHOLD', '75')),
  authzCacheTtl: Number(optionalEnv('AUTHZ_CACHE_TTL_SECONDS', '30')),
  grpcMaxMessageBytes: Number(optionalEnv('GRPC_MAX_MESSAGE_BYTES', String(16 * 1024 * 1024))),
  frontendOrigin: productionEnv('FRONTEND_ORIGIN', 'http://localhost:3000'),
  deployedFrontendOrigin: optionalEnv('DEPLOYED_FRONTEND_ORIGIN', 'https://dbms-project-chi-three.vercel.app'),
  mysqlUrl: rawDatabaseUrl,
  mysqlHost: serviceEnv('MYSQL_HOST', defaultHost),
  mysqlPort: servicePositiveIntEnv('MYSQL_PORT', defaultPort),
  mysqlUser: serviceEnv('MYSQL_USER', defaultUser),
  mysqlPassword: serviceEnv('MYSQL_PASSWORD', defaultPassword),
  mysqlDatabase: serviceEnv('MYSQL_DATABASE', defaultDatabase),
  mysqlConnectionLimit: positiveIntEnv('MYSQL_CONNECTION_LIMIT', 50),
  mysqlSsl: isTiDBDetected ? { rejectUnauthorized: false } : undefined,
  trustProxy: optionalEnv('TRUST_PROXY', 'false') === 'false' ? false : optionalEnv('TRUST_PROXY'),
  requireHttps: optionalEnv('REQUIRE_HTTPS', process.env.NODE_ENV === 'production' ? 'true' : 'false') === 'true',
  cookieConsentRetentionDays: positiveIntEnv('COOKIE_CONSENT_RETENTION_DAYS', 90),
};

if (config.nodeEnv === 'production' && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must have at least 32 characters in production');
}

if (!['insecure', 'mtls'].includes(config.grpcSecurityMode)) {
  throw new Error('GRPC_SECURITY_MODE must be insecure or mtls');
}
if (config.nodeEnv === 'production' && config.serviceAuthSecret.length < 32) {
  throw new Error('SERVICE_AUTH_SECRET must have at least 32 characters in production');
}
if (config.grpcSecurityMode === 'mtls' && (!config.grpcTlsCaPath || !config.grpcTlsCertPath || !config.grpcTlsKeyPath)) {
  throw new Error('mTLS requires GRPC_TLS_CA_PATH, GRPC_TLS_CERT_PATH, and GRPC_TLS_KEY_PATH');
}
