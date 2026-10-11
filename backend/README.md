# College ERP Backend

A service-oriented backend starter for the College ERP frontend. It uses Express.js REST APIs at the edge, gRPC for internal service communication, MySQL for relational data, Redis for authorization caching, Cloudinary for protected media, and PDF text extraction/OCR for teacher-reviewed marks validation.

> **Scope and status:** This is a starter codebase intended for local development and integration with the companion Next.js frontend. JavaScript syntax checks and focused unit tests are provided. Full production readiness still requires environment-specific end-to-end testing, Cloudinary configuration, OCR dependencies, database verification, and security review. Do not deploy with development credentials.

## Architecture

- `src/gateway/`: Express REST API, JWT verification, authorization middleware, gRPC clients, file uploads, and Cloudinary helpers.
- `src/services/auth/`: login, account creation/invitations, account status, `is_admin` and current authorization status.
- `src/services/profile/`: student/faculty profiles and administrative directory operations.
- `src/services/academic/`: departments, programs, academic years, semesters, class sections, subjects, enrollments, and teacher-subject allocations.
- `src/services/marks/`: assessment marks, PDF extraction/OCR, comparison, teacher confirmation, publication and results.
- `src/services/attendance/`: manual attendance, Excel/CSV preview/commit, low-attendance follow-ups, and teacher appointments.
- `src/services/paper/`: private Cloudinary uploads/retrieval and paper metadata.
- `src/services/notification/`: notifications and retryable transactional outbox delivery.
- `protos/erp.proto`: versionable gRPC service contract. This starter uses a JSON envelope over gRPC to keep prototyping simple; for a strict typed production contract, replace payload JSON with explicit protobuf request/response messages.
- `database/schema.sql`, `database/triggers.sql`: MySQL schema and triggers.

Services share one MySQL instance in local development, but each service owns its tables logically. gRPC listeners default to loopback for a single-host development setup. Configure private network addresses and transport security before deploying services across hosts.

## Requirements

- Node.js 20.9 or newer
- Docker Desktop / Docker Engine with Compose
- MySQL 8.4 (Compose starts it for local development)
- Redis 7 (Compose starts it for local development)
- Optional for scanned PDF OCR: Poppler (`pdftoppm`) installed on `PATH`; Tesseract.js uses language data at runtime and may need network access on first run
- Cloudinary account for profile photos and protected PDF delivery
- Optional Resend account if you want invitation emails in production

## Quick start

1. Copy the environment file:

   ```bash
   cp .env.example .env
   ```

2. Update `.env` before creating accounts. Set `JWT_SECRET` to a long random value and set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 12 characters), and `ADMIN_NAME`. Keep the Cloudinary API secret server-side; never use a `NEXT_PUBLIC_` variable for it.

3. Start MySQL and Redis:

   ```bash
   docker compose up -d mysql redis
   docker compose ps
   ```

   On a fresh MySQL volume, Compose loads `database/schema.sql` and `database/triggers.sql`. The database is named `college_erp`, and the local development credentials match `.env.example`. To recreate a fresh database from scratch, `docker compose down -v` deletes the local database volume and all its data; use that only when you intend to wipe development data.

4. Install dependencies:

   ```bash
   npm install
   ```

5. If you need to rerun the schema/migrations after MySQL is available:

   ```bash
   npm run db:migrate
   ```

6. Seed academic master data (departments, programs, years, semesters, sections, subjects, and class-subject offerings):

   ```bash
   npm run db:seed-demo
   ```

   This command creates master data only. It does **not** create sample user accounts or passwords.

7. Create the first administrator:

   ```bash
   npm run db:seed-admin
   ```

   Sign in using the admin credentials set in `.env`, then create teachers and students from the Admin Dashboard. Assign a teacher to a class-subject offering before the teacher can mark attendance or enter marks.

8. Start the gateway and service processes in one terminal:

   ```bash
   npm run dev
   ```

   The REST gateway listens at `http://localhost:4000`; health is available at `GET /health` and `GET /ready`. gRPC services run on ports `50051`–`50057` by default.

9. Configure the companion Next.js frontend's `.env.local`:

   ```dotenv
   NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
   NEXT_PUBLIC_DEMO_MODE=false
   ```

   Start the frontend separately. Some display widgets/assessment choices in the generated frontend still have demo defaults and should be wired to the backend's dynamic list endpoints before use with real records.

## Environment variables

See `.env.example`. Important values:

- `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_ACCESS_TTL`: signed short-lived access tokens. JWT contains user identity (`sub`), not an authorization role claim.
- `REDIS_URL`, `AUTHZ_CACHE_TTL_SECONDS`: authorization cache. Initial TTL is 30 seconds. Role/status changes invalidate `authz:<user-id>`; if Redis is down, the gateway tries Auth Service directly and denies a protected operation if it cannot verify current authorization.
- `MYSQL_*`: MySQL connection for local development.
- `*_GRPC_ADDR`: internal service endpoints.
- `CLOUDINARY_*`: server-side credentials and asset folders.
- `PDF_OCR_ENABLED`, `PDF_MAX_PAGES`, `MARKS_PDF_MAX_MB`: PDF processing limits.
- `LOW_ATTENDANCE_THRESHOLD`: attendance warning threshold, defaults to `75`.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`: optional invitation email delivery.

## REST API summary

All routes are mounted under `/api/v1`. Protected routes require `Authorization: Bearer <accessToken>`.

### Auth

- `POST /auth/login`
- `POST /auth/accept-invitation`
- `GET /auth/me`

### Admin

- `GET /admin/dashboard`
- `POST /admin/users`, `PATCH /admin/users/:id/status`
- `GET|POST /admin/students`, `GET|PATCH /admin/students/:id`
- `GET|POST /admin/teachers`, `GET|PATCH /admin/teachers/:id`
- `GET|POST /admin/departments`
- `POST /admin/programs`, `/admin/academic-years`, `/admin/semesters`, `/admin/classes`, `/admin/subjects`, `/admin/class-subjects`, `/admin/enrollments`
- `GET /admin/classes`, `/admin/subjects`, `/admin/teaching-assignments`; `POST /admin/teaching-assignments`

### Teacher

- `GET /teacher/dashboard`, `/teacher/classes`, `/teacher/classes/:classId/subjects/:subjectId/students`
- `GET|POST /teacher/assessments`
- `GET /teacher/marks/current`; `POST /teacher/assessments/:assessmentId/marks/bulk`
- `POST /teacher/marks/pdf-validation/preview`, `/teacher/marks/pdf-validation/confirm`
- `POST /teacher/assessments/:assessmentId/publish`
- `POST /teacher/attendance/sessions`; `POST /teacher/attendance/import/preview`; `POST /teacher/attendance/import/:jobId/commit`; `PATCH /teacher/attendance/sessions/:id/finalize`
- `GET /teacher/attendance/low`; `POST /teacher/students/:studentId/attendance-followups`; `GET /teacher/followups`
- `POST /teacher/availability-slots`; `GET /teacher/meetings`; `PATCH /teacher/meetings/:id/respond`, `/teacher/meetings/:id/complete`

### Student

- `GET /student/dashboard`, `/student/profile`, `/student/me/results`, `/student/attendance`, `/student/attendance-followups`, `/student/notifications`, `/student/meetings`
- `GET /student/attendance-followups/:id/available-slots`
- `POST /student/attendance-followups/:id/meeting-requests`
- `PATCH /student/meetings/:id/cancel`; `POST /student/meetings/:id/accept-proposal`
- `PATCH /student/notifications/:id/read`

### Papers and media

- `GET /papers`; `POST /papers`; `GET /papers/:id/access`; `PATCH /papers/:id`
- `POST /profile/avatar`

## Important workflows

### Accounts and authorization

- Every row in `users` has `is_admin`. New records default to `FALSE`; the first administrator is provisioned by `db:seed-admin`. The Auth Service checks that account creation and privilege changes originate from an active admin.
- Passwords are hashed with bcrypt. If an admin creates a user without a password, the service creates a one-use invitation token. In development it returns a setup link; in production configure Resend so the link can be delivered by email.
- The gateway verifies JWT locally, then checks current permissions through the Redis cache/Auth Service. The frontend never determines its own privileges.

### PDF marks validation

- Use an official marksheet/evaluated answer-sheet PDF containing enrollment/roll identifiers and awarded marks.
- Text PDFs use `pdf-parse`; image/scanned PDFs try OCR by calling `pdftoppm` and Tesseract.js. If OCR cannot run, the job presents missing/manual-review results rather than automatically saving marks.
- The current extractor looks for a numeric mark following each enrolled student's identifier on the same extracted line. PDF formats vary: test on your college's official PDFs and tune/replace the parser before production. OCR output and extracted values are not authoritative.
- The teacher must confirm every row. A reason is required for mismatched/missing/unmatched marks. The final mark range is checked against the assessment and a MySQL trigger validates the range again.
- The current validation request sends PDF bytes to the Marks Service as base64 over gRPC. Configure `GRPC_MAX_MESSAGE_BYTES` above the expected PDF size if needed, but prefer object references or streaming for larger files in a production design.

### Attendance imports

- Excel/CSV rows should have a roll/enrollment identifier and a status such as `PRESENT`, `ABSENT`, `LATE`, or `EXCUSED`.
- Preview matches all rows against the class roster and reports duplicates, unknown IDs, invalid states and missing students. A missing student is not automatically marked absent.
- Only a clean preview can be committed. Manual entry and Excel import use the same session/record tables.
- The service currently persists small import-preview rows as JSON in MySQL. For high volumes, move source files and row processing to durable object storage/workers.

### Notifications and meetings

- Attendance follow-ups generate outbox events. The Notification Service persists events into each recipient's in-app inbox and retries pending batches.
- Students can request appointment slots from their follow-up's assigned contact teacher. The teacher accepts, declines or offers another time; the student accepts a proposal; either party can cancel according to permissions.
- Meeting slots are reserved transactionally and overlap checks are enforced in service logic. Add load/concurrency integration testing before relying on appointment booking in production.

### MySQL triggers

`database/triggers.sql` creates triggers for mark range validation and mark INSERT/UPDATE/DELETE audit records, user `is_admin`/`is_active` changes, attendance status updates, and appointment status transitions. Triggers must remain database-local: they must not call gRPC, Redis or Cloudinary. Cross-service notifications use the transactional outbox instead.

## Validation commands

```bash
npm run check
npm test
```

These check JavaScript syntax and run unit tests for PDF identifier/marks matching. They do not replace MySQL integration tests, Cloudinary upload tests, gRPC endpoint tests, OCR quality tests or full frontend-to-backend end-to-end verification.

## Notes before production

- Change all default development passwords/secrets and restrict database/Redis ports to trusted networks.
- Use TLS/mTLS for inter-service gRPC when deployed across hosts; local default gRPC endpoints are insecure loopback connections.
- Configure Cloudinary authenticated delivery and verify signed URL behavior against your Cloudinary account's settings.
- Set upload limits, malware scanning, CPU/time limits, PDF page limits and OCR worker resource controls appropriate to your deployment.
- Audit logging is useful for accountability but does not replace backups, migration testing, data retention rules, or access reviews.
- The API gateway and services currently share MySQL credentials for a local starter. In a hardened deployment, use separate least-privilege database users/schemas per service.
