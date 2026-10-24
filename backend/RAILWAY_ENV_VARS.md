# Railway Environment Variables — per-service reference
# Set these in Railway → Project → Service → Variables (or via `railway variables set KEY=VALUE --service NAME`)
#
# ⚠️  NEVER commit real values here. This file is documentation only.
# ─────────────────────────────────────────────────────────────────────────────

## SHARED — set on ALL 8 services
## (Use Railway "Shared Variables" or set individually)
# ─────────────────────────────────────────────────────────────────────────────
# JWT_SECRET                   = <64-char random string>
# SERVICE_AUTH_SECRET          = <64-char random string, different from JWT_SECRET>
# NODE_ENV                     = production
# GRPC_SECURITY_MODE           = insecure   (upgrade to mtls once certs are in place)

## MYSQL — Railway MySQL plugin injects these automatically when you attach it.
## Override per-service with SERVICE_ prefix to enforce database isolation.
# ─────────────────────────────────────────────────────────────────────────────
# For each service set:
#   SERVICE_MYSQL_HOST         = <Railway MySQL internal host>
#   SERVICE_MYSQL_PORT         = 3306
#   SERVICE_MYSQL_USER         = erp_<servicename>   (create in Railway MySQL with GRANT)
#   SERVICE_MYSQL_PASSWORD     = <unique per-service password>
#   SERVICE_MYSQL_DATABASE     = college_erp_<servicename>
#
# Service → database mapping:
#   gateway      → college_erp_gateway      / erp_gateway
#   auth         → college_erp_auth         / erp_auth
#   profile      → college_erp_profile      / erp_profile
#   academic     → college_erp_academic     / erp_academic
#   attendance   → college_erp_attendance   / erp_attendance
#   marks        → college_erp_marks        / erp_marks
#   paper        → college_erp_paper        / erp_paper
#   notification → college_erp_notification / erp_notification

## REDIS — Railway Redis plugin injects REDIS_URL automatically.
# ─────────────────────────────────────────────────────────────────────────────
# REDIS_URL                    = (injected by Railway Redis plugin)

## GATEWAY only
# ─────────────────────────────────────────────────────────────────────────────
# PORT                         = (injected by Railway automatically)
# FRONTEND_ORIGIN              = https://your-frontend.vercel.app
# DEPLOYED_FRONTEND_ORIGIN     = https://dbms-project-chi-three.vercel.app
# FRONTEND_BASE_URL            = https://your-frontend.vercel.app
# TRUST_PROXY                  = 1
# REQUIRE_HTTPS                = true
# AUTH_GRPC_ADDR               = <auth-service Railway private hostname>:50051
# PROFILE_GRPC_ADDR            = <profile-service Railway private hostname>:50052
# ACADEMIC_GRPC_ADDR           = <academic-service Railway private hostname>:50053
# MARKS_GRPC_ADDR              = <marks-service Railway private hostname>:50054
# ATTENDANCE_GRPC_ADDR         = <attendance-service Railway private hostname>:50055
# PAPER_GRPC_ADDR              = <paper-service Railway private hostname>:50056
# NOTIFICATION_GRPC_ADDR       = <notification-service Railway private hostname>:50057
# MAX_UPLOAD_MB                = 10
# AUTHZ_CACHE_TTL_SECONDS      = 30

## CLOUDINARY — gateway, profile, marks, paper
# ─────────────────────────────────────────────────────────────────────────────
# CLOUDINARY_CLOUD_NAME        = your-cloud-name
# CLOUDINARY_API_KEY           = your-api-key
# CLOUDINARY_API_SECRET        = your-api-secret
# CLOUDINARY_PAPERS_FOLDER     = college-erp/papers
# CLOUDINARY_MARKS_FOLDER      = college-erp/marks-validation
# CLOUDINARY_PROFILES_FOLDER   = college-erp/profiles

## SMTP — auth, notification
# ─────────────────────────────────────────────────────────────────────────────
# SMTP_HOST                    = smtp.gmail.com
# SMTP_PORT                    = 465
# SMTP_SECURE                  = true
# SMTP_USER                    = your@gmail.com
# SMTP_PASS                    = <Gmail App Password>
# SMTP_FROM                    = "CampusFlow ERP" <your@gmail.com>

## MARKS / PAPER — marks service
# ─────────────────────────────────────────────────────────────────────────────
# PDF_OCR_ENABLED              = true
# PDF_MAX_PAGES                = 40
# MARKS_PDF_MAX_MB             = 8

## ATTENDANCE
# ─────────────────────────────────────────────────────────────────────────────
# LOW_ATTENDANCE_THRESHOLD     = 75

## GRPC listen addresses (each service listens on 0.0.0.0 inside the container)
# AUTH_GRPC_ADDR               = 0.0.0.0:50051   (set on auth service)
# PROFILE_GRPC_ADDR            = 0.0.0.0:50052   (set on profile service)
# ACADEMIC_GRPC_ADDR           = 0.0.0.0:50053   (set on academic service)
# MARKS_GRPC_ADDR              = 0.0.0.0:50054   (set on marks service)
# ATTENDANCE_GRPC_ADDR         = 0.0.0.0:50055   (set on attendance service)
# PAPER_GRPC_ADDR              = 0.0.0.0:50056   (set on paper service)
# NOTIFICATION_GRPC_ADDR       = 0.0.0.0:50057   (set on notification service)
