USE college_erp;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(180) NOT NULL,
  account_type ENUM('ADMIN','TEACHER','STUDENT') NOT NULL DEFAULT 'STUDENT',
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_set_password BOOLEAN NOT NULL DEFAULT FALSE,
  auth_version INT UNSIGNED NOT NULL DEFAULT 1,
  avatar_public_id VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_account_type (account_type, is_active),
  CHECK (is_admin = FALSE OR account_type = 'ADMIN')
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS departments (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS programs (
  id CHAR(36) PRIMARY KEY,
  department_id CHAR(36) NOT NULL,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  duration_years TINYINT UNSIGNED NOT NULL DEFAULT 4,
  FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS academic_years (
  id CHAR(36) PRIMARY KEY,
  label VARCHAR(20) NOT NULL UNIQUE,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (ends_on > starts_on)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS semesters (
  id CHAR(36) PRIMARY KEY,
  program_id CHAR(36) NOT NULL,
  semester_number TINYINT UNSIGNED NOT NULL,
  label VARCHAR(80) NOT NULL,
  FOREIGN KEY (program_id) REFERENCES programs(id),
  UNIQUE KEY uq_program_semester (program_id, semester_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id CHAR(36) PRIMARY KEY,
  enrollment_no VARCHAR(60) NOT NULL UNIQUE,
  department_id CHAR(36) NOT NULL,
  program_id CHAR(36) NOT NULL,
  admission_year SMALLINT UNSIGNED,
  current_year TINYINT UNSIGNED,
  current_semester TINYINT UNSIGNED,
  division VARCHAR(20),
  phone VARCHAR(30),
  date_of_birth DATE,
  address VARCHAR(500),
  avatar_public_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (program_id) REFERENCES programs(id),
  INDEX idx_student_dept_program (department_id, program_id, current_year, current_semester)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS faculty_profiles (
  user_id CHAR(36) PRIMARY KEY,
  employee_id VARCHAR(60) NOT NULL UNIQUE,
  department_id CHAR(36) NOT NULL,
  designation VARCHAR(120),
  qualification VARCHAR(255),
  specialization VARCHAR(255),
  joining_date DATE,
  phone VARCHAR(30),
  office_location VARCHAR(160),
  avatar_public_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (department_id) REFERENCES departments(id),
  INDEX idx_faculty_department (department_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS class_sections (
  id CHAR(36) PRIMARY KEY,
  program_id CHAR(36) NOT NULL,
  academic_year_id CHAR(36) NOT NULL,
  year_of_study TINYINT UNSIGNED NOT NULL,
  semester_id CHAR(36) NOT NULL,
  section_name VARCHAR(30) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (program_id) REFERENCES programs(id),
  FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
  FOREIGN KEY (semester_id) REFERENCES semesters(id),
  UNIQUE KEY uq_class_section (program_id, academic_year_id, year_of_study, semester_id, section_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subjects (
  id CHAR(36) PRIMARY KEY,
  program_id CHAR(36) NOT NULL,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(180) NOT NULL,
  credits DECIMAL(4,1) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (program_id) REFERENCES programs(id),
  UNIQUE KEY uq_subject_program_code (program_id, code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS class_subjects (
  id CHAR(36) PRIMARY KEY,
  class_section_id CHAR(36) NOT NULL,
  subject_id CHAR(36) NOT NULL,
  academic_year_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_section_id) REFERENCES class_sections(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id),
  FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
  UNIQUE KEY uq_class_subject_year (class_section_id, subject_id, academic_year_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS enrollments (
  id CHAR(36) PRIMARY KEY,
  student_user_id CHAR(36) NOT NULL,
  class_section_id CHAR(36) NOT NULL,
  enrolled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status ENUM('ACTIVE','COMPLETED','WITHDRAWN') NOT NULL DEFAULT 'ACTIVE',
  FOREIGN KEY (student_user_id) REFERENCES student_profiles(user_id),
  FOREIGN KEY (class_section_id) REFERENCES class_sections(id),
  UNIQUE KEY uq_student_class (student_user_id, class_section_id),
  INDEX idx_enrollment_class_status (class_section_id, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS teaching_assignments (
  id CHAR(36) PRIMARY KEY,
  teacher_user_id CHAR(36) NOT NULL,
  class_subject_id CHAR(36) NOT NULL,
  assigned_by_user_id CHAR(36) NOT NULL,
  status ENUM('ACTIVE','ENDED') NOT NULL DEFAULT 'ACTIVE',
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  FOREIGN KEY (teacher_user_id) REFERENCES faculty_profiles(user_id),
  FOREIGN KEY (class_subject_id) REFERENCES class_subjects(id),
  FOREIGN KEY (assigned_by_user_id) REFERENCES users(id),
  UNIQUE KEY uq_teacher_subject_active (teacher_user_id, class_subject_id, status),
  INDEX idx_assignment_teacher_status (teacher_user_id, status),
  INDEX idx_assignment_class_subject (class_subject_id, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assessments (
  id CHAR(36) PRIMARY KEY,
  class_subject_id CHAR(36) NOT NULL,
  name VARCHAR(180) NOT NULL,
  assessment_type ENUM('MSE','UNIT_TEST','PRACTICAL','ASSIGNMENT','FINAL','OTHER') NOT NULL DEFAULT 'OTHER',
  max_marks DECIMAL(7,2) NOT NULL,
  held_on DATE,
  status ENUM('DRAFT','OPEN','FINALIZED','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  created_by_user_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (class_subject_id) REFERENCES class_subjects(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CHECK (max_marks > 0),
  INDEX idx_assessment_subject_status (class_subject_id, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS marks (
  id CHAR(36) PRIMARY KEY,
  assessment_id CHAR(36) NOT NULL,
  student_user_id CHAR(36) NOT NULL,
  marks_obtained DECIMAL(7,2) NOT NULL,
  entered_by_user_id CHAR(36) NOT NULL,
  updated_by_user_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (assessment_id) REFERENCES assessments(id),
  FOREIGN KEY (student_user_id) REFERENCES student_profiles(user_id),
  FOREIGN KEY (entered_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id),
  UNIQUE KEY uq_assessment_student (assessment_id, student_user_id),
  CHECK (marks_obtained >= 0),
  INDEX idx_marks_student (student_user_id, assessment_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS marks_audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  mark_id CHAR(36) NOT NULL,
  assessment_id CHAR(36) NOT NULL,
  student_user_id CHAR(36) NOT NULL,
  action ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  old_marks DECIMAL(7,2) NULL,
  new_marks DECIMAL(7,2) NULL,
  changed_by_user_id CHAR(36) NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_marks_audit_student (student_user_id, changed_at),
  INDEX idx_marks_audit_mark (mark_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS marks_audit_context (
  connection_id BIGINT UNSIGNED PRIMARY KEY,
  actor_user_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mark_validation_jobs (
  id CHAR(36) PRIMARY KEY,
  assessment_id CHAR(36) NOT NULL,
  teacher_user_id CHAR(36) NOT NULL,
  pdf_public_id VARCHAR(255),
  original_filename VARCHAR(255) NOT NULL,
  status ENUM('PROCESSING','NEEDS_REVIEW','CONFIRMED','FAILED') NOT NULL DEFAULT 'PROCESSING',
  extraction_mode ENUM('TEXT','OCR','MIXED','FAILED') NOT NULL DEFAULT 'TEXT',
  error_message VARCHAR(500),
  input_pdf LONGBLOB NULL,
  entered_rows_json JSON NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  worker_locked_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP NULL,
  FOREIGN KEY (assessment_id) REFERENCES assessments(id),
  FOREIGN KEY (teacher_user_id) REFERENCES faculty_profiles(user_id),
  INDEX idx_validation_teacher_status (teacher_user_id, status, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_outbox_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_key VARCHAR(180) NOT NULL UNIQUE,
  recipient_email VARCHAR(320) NOT NULL,
  email_kind ENUM('PASSWORD_RESET','VERIFY_EMAIL','INVITATION','NOTIFICATION') NOT NULL,
  payload_json JSON NOT NULL,
  status ENUM('PENDING','PROCESSING','DELIVERED','FAILED') NOT NULL DEFAULT 'PENDING',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  available_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  worker_locked_at TIMESTAMP NULL,
  last_error VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP NULL,
  INDEX idx_email_outbox_ready (status, available_at, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mark_validation_items (
  id CHAR(36) PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  student_user_id CHAR(36) NULL,
  identifier_from_pdf VARCHAR(100),
  entered_marks DECIMAL(7,2) NULL,
  extracted_marks DECIMAL(7,2) NULL,
  final_marks DECIMAL(7,2) NULL,
  page_number INT NULL,
  confidence DECIMAL(5,4) NULL,
  evidence_text VARCHAR(500) NULL,
  status ENUM('MATCH','MISMATCH','STUDENT_NOT_MATCHED','MARKS_NOT_FOUND','INVALID_RANGE','MANUAL_REVIEW') NOT NULL,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason VARCHAR(500),
  FOREIGN KEY (job_id) REFERENCES mark_validation_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (student_user_id) REFERENCES student_profiles(user_id),
  INDEX idx_validation_item_job (job_id, status),
  UNIQUE KEY uq_validation_job_student (job_id, student_user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id CHAR(36) PRIMARY KEY,
  class_subject_id CHAR(36) NOT NULL,
  session_date DATE NOT NULL,
  lecture_no SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  marked_by_user_id CHAR(36) NOT NULL,
  entry_mode ENUM('MANUAL','EXCEL') NOT NULL DEFAULT 'MANUAL',
  status ENUM('DRAFT','FINALIZED') NOT NULL DEFAULT 'DRAFT',
  finalized_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (class_subject_id) REFERENCES class_subjects(id),
  FOREIGN KEY (marked_by_user_id) REFERENCES users(id),
  UNIQUE KEY uq_attendance_session (class_subject_id, session_date, lecture_no),
  INDEX idx_attendance_session_subject_date (class_subject_id, session_date, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance_records (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  student_user_id CHAR(36) NOT NULL,
  status ENUM('PRESENT','ABSENT','LATE','EXCUSED') NOT NULL,
  marked_by_user_id CHAR(36) NOT NULL,
  remarks VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_user_id) REFERENCES student_profiles(user_id),
  FOREIGN KEY (marked_by_user_id) REFERENCES users(id),
  UNIQUE KEY uq_attendance_session_student (session_id, student_user_id),
  INDEX idx_attendance_student_status (student_user_id, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance_audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attendance_record_id CHAR(36) NOT NULL,
  student_user_id CHAR(36) NOT NULL,
  old_status VARCHAR(20) NOT NULL,
  new_status VARCHAR(20) NOT NULL,
  changed_by_user_id CHAR(36) NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_attendance_audit_student (student_user_id, changed_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance_import_jobs (
  id CHAR(36) PRIMARY KEY,
  teacher_user_id CHAR(36) NOT NULL,
  class_subject_id CHAR(36) NOT NULL,
  session_date DATE NOT NULL,
  lecture_no SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('PREVIEWED','INVALID','COMMITTED','EXPIRED') NOT NULL DEFAULT 'PREVIEWED',
  input_rows INT UNSIGNED NOT NULL DEFAULT 0,
  valid_rows INT UNSIGNED NOT NULL DEFAULT 0,
  error_rows INT UNSIGNED NOT NULL DEFAULT 0,
  rows_json JSON NOT NULL,
  errors_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  FOREIGN KEY (teacher_user_id) REFERENCES faculty_profiles(user_id),
  FOREIGN KEY (class_subject_id) REFERENCES class_subjects(id),
  INDEX idx_import_teacher_status (teacher_user_id, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_attendance_followups (
  id CHAR(36) PRIMARY KEY,
  student_user_id CHAR(36) NOT NULL,
  class_subject_id CHAR(36) NOT NULL,
  attendance_percent DECIMAL(5,2) NOT NULL,
  required_percent DECIMAL(5,2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  tagged_by_user_id CHAR(36) NOT NULL,
  contact_teacher_user_id CHAR(36) NOT NULL,
  status ENUM('OPEN','ACKNOWLEDGED','MEETING_REQUESTED','RESOLVED') NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP NULL,
  FOREIGN KEY (student_user_id) REFERENCES student_profiles(user_id),
  FOREIGN KEY (class_subject_id) REFERENCES class_subjects(id),
  FOREIGN KEY (tagged_by_user_id) REFERENCES users(id),
  FOREIGN KEY (contact_teacher_user_id) REFERENCES faculty_profiles(user_id),
  INDEX idx_followup_student_status (student_user_id, status),
  INDEX idx_followup_class_status (class_subject_id, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS teacher_availability_slots (
  id CHAR(36) PRIMARY KEY,
  teacher_user_id CHAR(36) NOT NULL,
  starts_at_utc DATETIME NOT NULL,
  ends_at_utc DATETIME NOT NULL,
  status ENUM('AVAILABLE','REQUESTED','BOOKED','BLOCKED') NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_user_id) REFERENCES faculty_profiles(user_id),
  CHECK (ends_at_utc > starts_at_utc),
  UNIQUE KEY uq_teacher_slot_start (teacher_user_id, starts_at_utc),
  INDEX idx_slot_lookup (teacher_user_id, status, starts_at_utc)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS appointments (
  id CHAR(36) PRIMARY KEY,
  followup_id CHAR(36) NOT NULL,
  student_user_id CHAR(36) NOT NULL,
  teacher_user_id CHAR(36) NOT NULL,
  slot_id CHAR(36) NOT NULL,
  status ENUM('REQUESTED','CONFIRMED','DECLINED','RESCHEDULE_PROPOSED','CANCELLED_BY_STUDENT','CANCELLED_BY_TEACHER','COMPLETED','NO_SHOW') NOT NULL DEFAULT 'REQUESTED',
  student_message VARCHAR(500),
  teacher_response VARCHAR(500),
  meeting_location VARCHAR(255),
  proposed_slot_id CHAR(36) NULL,
  updated_by_user_id CHAR(36) NULL,
  idempotency_key VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  responded_at TIMESTAMP NULL,
  active_followup_id CHAR(36) GENERATED ALWAYS AS (
    CASE WHEN status IN ('REQUESTED','CONFIRMED','RESCHEDULE_PROPOSED') THEN followup_id ELSE NULL END
  ) STORED,
  FOREIGN KEY (followup_id) REFERENCES student_attendance_followups(id),
  FOREIGN KEY (student_user_id) REFERENCES student_profiles(user_id),
  FOREIGN KEY (teacher_user_id) REFERENCES faculty_profiles(user_id),
  FOREIGN KEY (slot_id) REFERENCES teacher_availability_slots(id),
  FOREIGN KEY (proposed_slot_id) REFERENCES teacher_availability_slots(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id),
  UNIQUE KEY uq_active_followup (active_followup_id),
  UNIQUE KEY uq_student_idempotency (student_user_id, idempotency_key),
  INDEX idx_student_appointments (student_user_id, status, created_at),
  INDEX idx_teacher_appointments (teacher_user_id, status, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS appointment_audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id CHAR(36) NOT NULL,
  actor_user_id CHAR(36) NULL,
  old_status VARCHAR(32) NOT NULL,
  new_status VARCHAR(32) NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id),
  INDEX idx_appointment_audit (appointment_id, changed_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS media_assets (
  id CHAR(36) PRIMARY KEY,
  owner_user_id CHAR(36) NOT NULL,
  category ENUM('PROFILE_IMAGE','QUESTION_PAPER','MARKSHEET_PDF','ANSWER_SHEET_PDF','OTHER') NOT NULL,
  cloudinary_public_id VARCHAR(255) NOT NULL UNIQUE,
  resource_type VARCHAR(40) NOT NULL DEFAULT 'image',
  delivery_type VARCHAR(40) NOT NULL DEFAULT 'authenticated',
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  bytes_size BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id),
  INDEX idx_media_owner_category (owner_user_id, category)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS papers (
  id CHAR(36) PRIMARY KEY,
  media_asset_id CHAR(36) NOT NULL,
  subject_id CHAR(36) NOT NULL,
  academic_year_id CHAR(36) NULL,
  semester_id CHAR(36) NULL,
  title VARCHAR(220) NOT NULL,
  paper_type ENUM('QUESTION_PAPER','MARKING_SCHEME','ANSWER_KEY','OTHER') NOT NULL DEFAULT 'QUESTION_PAPER',
  visibility ENUM('FACULTY_ONLY','ENROLLED_STUDENTS','PUBLIC') NOT NULL DEFAULT 'ENROLLED_STUDENTS',
  status ENUM('DRAFT','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  uploaded_by_user_id CHAR(36) NOT NULL,
  published_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (media_asset_id) REFERENCES media_assets(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id),
  FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
  FOREIGN KEY (semester_id) REFERENCES semesters(id),
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id),
  INDEX idx_papers_subject_status (subject_id, status, visibility)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_notifications (
  id CHAR(36) PRIMARY KEY,
  recipient_user_id CHAR(36) NOT NULL,
  event_key VARCHAR(180) NULL,
  notification_type VARCHAR(60) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message VARCHAR(500) NOT NULL,
  related_entity_type VARCHAR(50) NULL,
  related_entity_id CHAR(36) NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipient_user_id) REFERENCES users(id),
  UNIQUE KEY uq_notification_event (recipient_user_id, event_key),
  INDEX idx_notification_inbox (recipient_user_id, is_read, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notification_outbox_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_key VARCHAR(180) NOT NULL UNIQUE,
  recipient_user_id CHAR(36) NOT NULL,
  notification_type VARCHAR(60) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message VARCHAR(500) NOT NULL,
  related_entity_type VARCHAR(50) NULL,
  related_entity_id CHAR(36) NULL,
  status ENUM('PENDING','PROCESSING','DELIVERED','FAILED') NOT NULL DEFAULT 'PENDING',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP NULL,
  FOREIGN KEY (recipient_user_id) REFERENCES users(id),
  INDEX idx_outbox_status_created (status, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_invitations (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_invitation_user (user_id, expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_verifications (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_verification_user (user_id, expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_security_audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  changed_field ENUM('is_admin','is_active') NOT NULL,
  old_value VARCHAR(10) NOT NULL,
  new_value VARCHAR(10) NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_security_audit (user_id, changed_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cookie_consent_logs (
  id CHAR(36) PRIMARY KEY,
  decision ENUM('ACCEPTED','REJECTED') NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  user_agent VARCHAR(1024) NULL,
  requested_path VARCHAR(255) NULL,
  request_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cookie_consent_created_at (created_at),
  INDEX idx_cookie_consent_ip (ip_address)
) ENGINE=InnoDB;
