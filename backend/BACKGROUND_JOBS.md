# Background jobs

The database is the durable queue, so workers can restart or scale independently without losing submitted work.

- `POST /teacher/marks/pdf-validation/preview` returns `202` with a `jobId`; the PDF is stored only until matching completes.
- `GET /teacher/marks/pdf-validation/:jobId` reports `PROCESSING`, `NEEDS_REVIEW`, `CONFIRMED`, or `FAILED` and returns review rows when ready.
- The marks service claims jobs with `FOR UPDATE SKIP LOCKED`. A stuck claim becomes eligible again after five minutes; a job is retried twice before it becomes `FAILED`.
- Account verification, password reset, invitation, and notification emails enter `email_outbox_events`. The notification service delivers them with retry/backoff (up to five attempts).

Run `npm run db:migrate` before deploying this release so existing databases receive the additive marks-job columns and the email outbox table.
