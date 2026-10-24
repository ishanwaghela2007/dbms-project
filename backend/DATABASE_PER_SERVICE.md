# Database-per-service rollout

Production service processes now reject the shared `college_erp` database and generic/root accounts. Each service must receive exactly its matching `SERVICE_MYSQL_DATABASE` and dedicated credential:

| Service | Database | Development user |
| --- | --- | --- |
| gateway | `college_erp_gateway` | `erp_gateway` |
| auth | `college_erp_auth` | `erp_auth` |
| profile | `college_erp_profile` | `erp_profile` |
| academic | `college_erp_academic` | `erp_academic` |
| attendance | `college_erp_attendance` | `erp_attendance` |
| marks | `college_erp_marks` | `erp_marks` |
| paper | `college_erp_paper` | `erp_paper` |
| notification | `college_erp_notification` | `erp_notification` |

`docker compose up` provisions these databases and grants. Those local passwords are deliberately development-only; provision production accounts through the secret manager with grants on **only** the listed database.

The existing `college_erp` schema is a compatibility schema. It cannot be safely pointed at a service-specific production account because its tables and foreign keys cross domains. The final data migration must be performed in this order:

1. Auth: users, invitations, password resets, and email verification.
2. Academic: departments, programs, classes, subjects, enrollments, and teaching assignments.
3. Profile: student/faculty profile attributes and local identity read model.
4. Attendance, then Marks, followed by Paper/Media and Notifications.

At every boundary, replace a SQL join to another owner with a signed gRPC read or a locally owned event-driven read model. Never add a cross-database foreign key. Run a domain's service migration and backfill its read model before enabling the isolation guard for that service.
