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

function productionEnv(name, fallback) {
  if (process.env.NODE_ENV === 'production' && !process.env[name]) {
    throw new Error(`Missing required production environment variable: ${name}`);
  }
  return optionalEnv(name, fallback);
}

function positiveIntEnv(name, fallback) {
  const value = Number(productionEnv(name, String(fallback)));
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function serviceEnv(name, fallback) {
  const serviceValue = process.env[`SERVICE_${name}`];
  if (serviceValue) return serviceValue;
  return productionEnv(name, fallback);
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
const defaultDatabase = process.env.NODE_ENV === 'production' ? serviceDatabases[configuredServiceName] : 'college_erp';

export const config = {
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  serviceName: configuredServiceName,
  jwtSecret: productionEnv('JWT_SECRET', 'local-dev-only-change-this-secret-32-bytes-minimum'),
  serviceAuthSecret: productionEnv('SERVICE_AUTH_SECRET', 'local-dev-only-service-auth-secret-change-me'),
  serviceAuthTtl: optionalEnv('SERVICE_AUTH_TTL', '30s'),
  grpcSecurityMode: optionalEnv('GRPC_SECURITY_MODE', process.env.NODE_ENV === 'production' ? 'mtls' : 'insecure'),
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
  mysqlHost: serviceEnv('MYSQL_HOST', '127.0.0.1'),
  mysqlPort: servicePositiveIntEnv('MYSQL_PORT', 3306),
  mysqlUser: serviceEnv('MYSQL_USER', 'erp_user'),
  mysqlPassword: serviceEnv('MYSQL_PASSWORD', 'change_me'),
  mysqlDatabase: serviceEnv('MYSQL_DATABASE', defaultDatabase),
  mysqlConnectionLimit: positiveIntEnv('MYSQL_CONNECTION_LIMIT', 10),
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
if (config.nodeEnv === 'production') {
  const expectedDatabase = serviceDatabases[config.serviceName];
  if (!expectedDatabase) throw new Error(`SERVICE_NAME must identify a deployed service; received ${config.serviceName}`);
  if (config.mysqlDatabase !== expectedDatabase) throw new Error(`${config.serviceName} must use only ${expectedDatabase}; set SERVICE_MYSQL_DATABASE accordingly`);
  if (config.mysqlUser === 'erp_user' || config.mysqlUser === 'root') throw new Error('Production services must use a dedicated, non-root MySQL account');
}
