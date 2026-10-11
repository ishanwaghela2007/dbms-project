# CampusFlow College ERP — Next.js Frontend

A responsive frontend starter for the College ERP system. It uses **Next.js App Router, React, TypeScript, custom CSS, Lucide icons, and SheetJS (`xlsx`)**. It includes Administrator, Teacher and Student workspaces and an API client designed for an Express REST gateway.

> **Current mode:** `NEXT_PUBLIC_DEMO_MODE=true` is the default. Seed data and most interactions are a frontend preview only. This repository does not include the Express/gRPC backend, MySQL database or Cloudinary credentials. No preview action should be interpreted as proof that a real backend record was saved.

## Run locally

Prerequisite: **Node.js 20.9 or newer** (the Next.js App Router tooling in this starter follows the current Next.js system requirements).

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The app opens at `/login`; while demo mode is enabled, choose Administrator, Teacher or Student to explore each workspace. A password is not required for the demo.

To connect the Express gateway, configure `.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_DEMO_MODE=false
```

Restart the Next.js development server after changing environment variables. The production API must provide CORS for the frontend origin, use HTTPS, enforce authorization on every protected operation, and return payloads compatible with `src/lib/api/erp.ts`.

## Pages and workflows

| Route | Workspace | Included UI |
|---|---|---|
| `/login` | Shared | Login UI and demo workspace selector |
| `/admin` | Admin | Campus overview, student/faculty counts, quick links and action queue |
| `/admin/students` | Admin | Search/filter students and create student profiles |
| `/admin/teachers` | Admin | Search/filter faculty, create teacher profiles and inspect allocation summaries |
| `/admin/academics` | Admin | Assign a teacher to a subject/class/semester offering |
| `/admin/attendance-alerts` | Admin | Campus-wide low-attendance cases and follow-up status |
| `/papers` | Admin | Paper library and PDF upload controls |
| `/teacher` | Teacher | Teaching overview, assignments, marks and attendance actions |
| `/teacher/marks` | Teacher | Upload PDF, preview extracted marks, compare with entered marks, require exception reasons and row-by-row teacher confirmation |
| `/teacher/attendance` | Teacher | Manual register and Excel/CSV parsing, preview, correction of invalid rows, and explicit import confirmation |
| `/teacher/followups` | Teacher | Tag low-attendance students, choose contact person and manage follow-ups |
| `/teacher/meetings` | Teacher | Accept, decline or propose alternate student appointment slots |
| `/teacher/papers` | Teacher | Paper library and upload UI |
| `/student` | Student | Student overview, attendance by subject, results and low-attendance prompt |
| `/student/results` | Student | Published assessment results |
| `/student/notifications` | Student | Attendance alert, named teacher contact, acknowledgement and meeting link |
| `/student/meetings` | Student | Request meeting with available teacher, see status, cancel pending request |
| `/student/papers` | Student | Authorized paper library view |
| `/settings`, `/teacher/settings`, `/student/settings` | All | Profile/notification preferences and admin connection notes |

## Folder structure

```text
college-erp-nextjs/
├── public/                          # Static assets
├── src/
│   ├── app/
│   │   ├── layout.tsx               # Root layout and global styles
│   │   ├── page.tsx                 # Redirect to /login
│   │   ├── globals.css              # Responsive theme/components
│   │   ├── login/page.tsx
│   │   └── (portal)/
│   │       ├── layout.tsx           # Shared role-aware portal shell
│   │       ├── admin/
│   │       │   ├── page.tsx
│   │       │   ├── students/page.tsx
│   │       │   ├── teachers/page.tsx
│   │       │   ├── academics/page.tsx
│   │       │   └── attendance-alerts/page.tsx
│   │       ├── teacher/
│   │       │   ├── page.tsx
│   │       │   ├── marks/page.tsx
│   │       │   ├── attendance/page.tsx
│   │       │   ├── followups/page.tsx
│   │       │   ├── meetings/page.tsx
│   │       │   ├── papers/page.tsx
│   │       │   └── settings/page.tsx
│   │       ├── student/
│   │       │   ├── page.tsx
│   │       │   ├── results/page.tsx
│   │       │   ├── notifications/page.tsx
│   │       │   ├── meetings/page.tsx
│   │       │   ├── papers/page.tsx
│   │       │   └── settings/page.tsx
│   │       ├── papers/page.tsx
│   │       └── settings/page.tsx
│   ├── components/
│   │   ├── ui.tsx                    # Page headings, buttons, cards and badges
│   │   ├── portal-shell.tsx          # Navigation, header and role switcher
│   │   ├── followups-dashboard.tsx   # Shared teacher/admin follow-up UI
│   │   ├── papers-library.tsx        # Shared paper library/upload UI
│   │   └── settings-form.tsx         # Role-specific settings UI
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts             # Auth token attachment and REST client
│   │   │   └── erp.ts                # API facade and demo-mode adapters
│   │   └── data/demo.ts              # Sample data for preview only
│   └── types/erp.ts                  # Frontend domain types
├── .env.example
├── eslint.config.mjs
├── next.config.ts
├── tsconfig.json
└── package.json
```

## Main integration contract

The frontend calls the Express API Gateway over REST. The gateway is responsible for JWT verification and dispatching to internal gRPC services. Browser code must not connect directly to gRPC, MySQL or Cloudinary using secret credentials.

The Excel parser dependency is pinned to the official SheetJS CDN tarball; see the official [SheetJS installation guide](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) for package provenance.

The API facade is in `src/lib/api/erp.ts`. In connected mode, it expects endpoints broadly matching the following paths:

```text
POST   /auth/login
GET    /admin/dashboard
GET    /admin/students
POST   /admin/students
GET    /admin/teachers
POST   /admin/teachers
GET    /teacher/dashboard
GET    /student/dashboard
GET    /student/results
GET    /teacher/attendance/low
GET    /teacher/classes
GET    /teacher/classes/:classId/subjects/:subjectId/students
POST   /teacher/attendance/sessions
POST   /teacher/marks/pdf-validation/preview
POST   /teacher/marks/pdf-validation/confirm
POST   /teacher/students/:studentId/attendance-followups
GET    /teacher/meetings?status=REQUESTED
PATCH  /teacher/meetings/:id/respond
GET    /student/notifications
PATCH  /student/notifications/:id/read
GET    /student/meetings
GET    /teacher/meetings
POST   /student/attendance-followups/:followupId/meeting-requests
PATCH  /student/meetings/:id/cancel
GET    /papers
POST   /papers
GET    /papers/:id/access
```

Align these routes and response shapes with the final OpenAPI spec and the generated gRPC contracts. The examples are a proposed frontend contract, not evidence that the services already exist. The dashboard KPI cards, student/teacher directories, low-attendance follow-ups, papers, student notifications/results/meetings, and attendance roster use the API facade in connected mode. Some admin analytics charts, teaching-assignment form options, static timetable examples, and meeting-slot selection are still presentation/demo data until you wire their master-data/availability/reporting endpoints.

### PDF marks review

1. Teacher chooses an assigned assessment and uploads a PDF.
2. Backend validates file limits, reads PDF text or OCR, matches student identifiers and returns extracted evidence with confidence/source details.
3. UI compares PDF marks with the entered value, flags discrepancies, permits an explicit manual override with a reason, and requires row-by-row confirmation.
4. The final confirmation request is sent only when all rows are confirmed and valid. The Marks Service must revalidate the payload and authorization server-side before the MySQL transaction.

Demo mode returns sample extraction rows and does not process the selected PDF.

### Attendance register

The manual register requires a status for each student. Excel import reads `.xlsx`, `.xls`, or `.csv` in the browser with SheetJS and previews the normalized rows. Missing students remain unmarked for explicit review; unknown roll numbers and duplicate rows must be fixed before the UI enables commit. The backend must repeat all validations because browser-side validation is not a security boundary.

### Paper uploads

The upload UI sends multipart form data to Express. The server validates the file and stores it in Cloudinary. Private/restricted documents must be delivered only after server-side authorization, typically through an authenticated/signed delivery flow. Do not put Cloudinary API secrets in `NEXT_PUBLIC_*` variables.

## Key files to customize

- `src/lib/data/demo.ts`: replace sample records with realistic test fixtures (avoid real student PII in public demos).
- `src/lib/api/erp.ts`: align endpoint paths, pagination, errors and DTOs to your actual backend contract.
- `src/components/portal-shell.tsx`: update campus branding and role-based navigation.
- `src/app/globals.css`: tune colors, spacing and responsive layouts.
- `src/types/erp.ts`: keep frontend DTOs synchronized with API response schemas.

## Production checklist

- Use backend-provisioned identity and privileges. `is_admin` is never editable from a public form; enforce admin permissions on the API.
- Store access tokens securely. This starter stores a bearer token in `localStorage` for demo integration convenience; a production browser app should evaluate secure HttpOnly cookie sessions or another appropriate token-storage pattern.
- Do not treat client-side role navigation as access control.
- Rate-limit and size-limit uploads; validate MIME type and actual PDF/XLSX structure server-side.
- Avoid public Cloudinary delivery for confidential marksheets, attendance records or restricted exam materials.
- Use idempotency keys for attendance commits and meeting booking requests.
- Make attendance and marks changes auditable; trigger-created audit rows should be in the same transactional database boundary.
- Add backend integration tests and end-to-end browser tests after the API contract is available.
