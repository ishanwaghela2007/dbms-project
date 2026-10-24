# Zero-trust service model

The API gateway is the only public-facing process. Every request must be authenticated at the gateway, authorized against the Auth service, and re-authorized by the domain service for the requested resource.

## Workload identity

Each gRPC call carries a short-lived signed workload token in gRPC metadata. A service rejects a request unless the token is valid, unexpired, and has that service as its audience. This prevents callers on the internal network from invoking a service merely because they can reach its port.

Set these environment variables in production:

```text
SERVICE_AUTH_SECRET=<unique, 32+ character secret managed outside Git>
SERVICE_AUTH_TTL=30s
GRPC_SECURITY_MODE=mtls
GRPC_TLS_CA_PATH=/run/secrets/internal-ca.pem
GRPC_TLS_CERT_PATH=/run/secrets/<workload>.crt
GRPC_TLS_KEY_PATH=/run/secrets/<workload>.key
```

`GRPC_SECURITY_MODE=mtls` requires each workload to present a certificate trusted by the internal CA. Development may use `insecure` only on loopback addresses.

## Independent service deployment

Every service has a dedicated start command and workload identity:

```sh
npm run start:auth
npm run start:profile
npm run start:academic
npm run start:marks
npm run start:attendance
npm run start:paper
npm run start:notification
npm run start:gateway
```

Services can use separate database credentials and endpoints by supplying `SERVICE_MYSQL_HOST`, `SERVICE_MYSQL_PORT`, `SERVICE_MYSQL_USER`, `SERVICE_MYSQL_PASSWORD`, and `SERVICE_MYSQL_DATABASE`. These override the shared development values.

## Migration boundary

The current schema has cross-domain foreign keys and is therefore still a shared-database design. The scoped credentials and authenticated mTLS calls make the current deployment safer, but they are not a complete database-per-service split.

To finish that split, move ownership in this order: Auth (`users`, credentials, verification), Academic (programs, classes, enrollments), Profile, Attendance, Marks, Paper/Media, then Notifications. Replace cross-service SQL joins with authenticated gRPC reads or event-driven read models. Do not grant a service access to another service's production schema.
