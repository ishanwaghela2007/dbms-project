# Local token authorization

The gateway verifies the JWT signature, issuer, audience, expiry, active flag, role, admin flag, and `authVersion` locally. A normal authenticated request does **not** call Auth Service.

At login Auth writes `authz:version:<userId>` to Redis and signs that version into the token. Password changes, account state changes, and role changes increment the database version and write `invalidated`, which rejects existing tokens immediately when Redis is available. Redis loss does not make Auth a per-request dependency; the access token expiry (15 minutes by default) bounds the remaining session lifetime.

Do not trust roles from request JSON. Only use claims produced by `authenticate` after signature verification.
