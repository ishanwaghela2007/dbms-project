-- ============================================================================
-- LEGACY MYSQL TRIGGERS (REFERENCE ONLY)
--
-- TiDB Cloud does not support MySQL triggers. All 8 triggers below have been
-- refactored into backend application services with transactional integrity:
-- 1. trg_marks_before_insert   -> backend/src/services/marks/marks-audit.js (validateMarks, recordMarkWithAudit)
-- 2. trg_marks_before_update   -> backend/src/services/marks/marks-audit.js (validateMarks, recordMarkWithAudit)
-- 3. trg_marks_after_insert    -> backend/src/services/marks/marks-audit.js (recordMarkWithAudit)
-- 4. trg_marks_after_update    -> backend/src/services/marks/marks-audit.js (recordMarkWithAudit)
-- 5. trg_marks_after_delete    -> backend/src/services/marks/marks-audit.js (deleteMarkWithAudit)
-- 6. trg_user_security_audit   -> backend/src/shared/user-security-audit.js (auditUserSecurity)
-- 7. trg_attendance_after_update -> backend/src/services/attendance/index.js (saveRegister)
-- 8. trg_appointment_status_audit -> backend/src/services/attendance/index.js (recordAppointmentAudit)
--
-- database/migrate.js automatically skips this file when running on TiDB Cloud.
-- ============================================================================
USE college_erp;
DELIMITER $$

DROP TRIGGER IF EXISTS trg_marks_before_insert$$
CREATE TRIGGER trg_marks_before_insert
BEFORE INSERT ON marks
FOR EACH ROW
BEGIN
  DECLARE v_max_marks DECIMAL(7,2) DEFAULT NULL;
  SELECT max_marks INTO v_max_marks FROM assessments WHERE id = NEW.assessment_id;
  IF v_max_marks IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Assessment not found';
  END IF;
  IF NEW.marks_obtained < 0 OR NEW.marks_obtained > v_max_marks THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Marks must be between zero and maximum marks';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_marks_before_update$$
CREATE TRIGGER trg_marks_before_update
BEFORE UPDATE ON marks
FOR EACH ROW
BEGIN
  DECLARE v_max_marks DECIMAL(7,2) DEFAULT NULL;
  SELECT max_marks INTO v_max_marks FROM assessments WHERE id = NEW.assessment_id;
  IF v_max_marks IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Assessment not found';
  END IF;
  IF NEW.marks_obtained < 0 OR NEW.marks_obtained > v_max_marks THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Marks must be between zero and maximum marks';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_marks_after_insert$$
CREATE TRIGGER trg_marks_after_insert
AFTER INSERT ON marks
FOR EACH ROW
BEGIN
  DECLARE v_actor CHAR(36) DEFAULT NULL;
  SET v_actor = (SELECT actor_user_id FROM marks_audit_context WHERE connection_id = CONNECTION_ID() LIMIT 1);
  INSERT INTO marks_audit_logs (mark_id, assessment_id, student_user_id, action, old_marks, new_marks, changed_by_user_id)
  VALUES (NEW.id, NEW.assessment_id, NEW.student_user_id, 'INSERT', NULL, NEW.marks_obtained, COALESCE(v_actor, NEW.entered_by_user_id));
END$$

DROP TRIGGER IF EXISTS trg_marks_after_update$$
CREATE TRIGGER trg_marks_after_update
AFTER UPDATE ON marks
FOR EACH ROW
BEGIN
  DECLARE v_actor CHAR(36) DEFAULT NULL;
  SET v_actor = (SELECT actor_user_id FROM marks_audit_context WHERE connection_id = CONNECTION_ID() LIMIT 1);
  IF NOT (OLD.marks_obtained <=> NEW.marks_obtained) THEN
    INSERT INTO marks_audit_logs (mark_id, assessment_id, student_user_id, action, old_marks, new_marks, changed_by_user_id)
    VALUES (NEW.id, NEW.assessment_id, NEW.student_user_id, 'UPDATE', OLD.marks_obtained, NEW.marks_obtained, COALESCE(v_actor, NEW.updated_by_user_id));
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_marks_after_delete$$
CREATE TRIGGER trg_marks_after_delete
AFTER DELETE ON marks
FOR EACH ROW
BEGIN
  DECLARE v_actor CHAR(36) DEFAULT NULL;
  SET v_actor = (SELECT actor_user_id FROM marks_audit_context WHERE connection_id = CONNECTION_ID() LIMIT 1);
  INSERT INTO marks_audit_logs (mark_id, assessment_id, student_user_id, action, old_marks, new_marks, changed_by_user_id)
  VALUES (OLD.id, OLD.assessment_id, OLD.student_user_id, 'DELETE', OLD.marks_obtained, NULL, v_actor);
END$$

DROP TRIGGER IF EXISTS trg_user_security_audit$$
CREATE TRIGGER trg_user_security_audit
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
  IF OLD.is_admin <> NEW.is_admin THEN
    INSERT INTO user_security_audit_logs (user_id, changed_field, old_value, new_value, changed_at)
    VALUES (NEW.id, 'is_admin', CAST(OLD.is_admin AS CHAR), CAST(NEW.is_admin AS CHAR), CURRENT_TIMESTAMP);
  END IF;
  IF OLD.is_active <> NEW.is_active THEN
    INSERT INTO user_security_audit_logs (user_id, changed_field, old_value, new_value, changed_at)
    VALUES (NEW.id, 'is_active', CAST(OLD.is_active AS CHAR), CAST(NEW.is_active AS CHAR), CURRENT_TIMESTAMP);
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_attendance_after_update$$
CREATE TRIGGER trg_attendance_after_update
AFTER UPDATE ON attendance_records
FOR EACH ROW
BEGIN
  DECLARE v_actor CHAR(36) DEFAULT NULL;
  IF OLD.status <> NEW.status THEN
    SET v_actor = NEW.marked_by_user_id;
    INSERT INTO attendance_audit_logs (attendance_record_id, student_user_id, old_status, new_status, changed_by_user_id)
    VALUES (NEW.id, NEW.student_user_id, OLD.status, NEW.status, v_actor);
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_appointment_status_audit$$
CREATE TRIGGER trg_appointment_status_audit
AFTER UPDATE ON appointments
FOR EACH ROW
BEGIN
  IF OLD.status <> NEW.status THEN
    INSERT INTO appointment_audit_logs (appointment_id, actor_user_id, old_status, new_status)
    VALUES (NEW.id, NEW.updated_by_user_id, OLD.status, NEW.status);
  END IF;
END$$

DELIMITER ;
