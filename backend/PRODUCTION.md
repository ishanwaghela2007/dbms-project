# Production deployment checklist

Before deployment, configure these values in the deployment platform's secret manager. Do not copy local `.env` credentials into production.

- `NODE_ENV=production`
- `JWT_SECRET` - long, unique random secret
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
- `FRONTEND_ORIGIN` and `FRONTEND_BASE_URL` - HTTPS public frontend URL
- `TRUST_PROXY` - the trusted reverse-proxy setting, for example `loopback` when the gateway is only reached through a local proxy
- `REQUIRE_HTTPS=true`
- `COOKIE_CONSENT_RETENTION_DAYS` - maximum consent-log retention period; defaults to 90 days
- Mail and media-provider credentials, if those integrations are enabled

Deploy behind HTTPS. If TLS terminates at a reverse proxy, configure `TRUST_PROXY` correctly so Express can enforce HTTPS and record the original client IP address.

Run `npm run db:migrate` with a MySQL migration account that can create the project's triggers. The account needs the database permissions required by the schema and triggers, or the database administrator must enable the appropriate binary-log trigger policy.

Cookie consent records include the decision, IP address, user agent, requested page, and timestamp. Limit database access to authorized administrators, keep the configured retention period, and publish a privacy notice describing this collection before release.
