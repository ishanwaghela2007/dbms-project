import { randomUUID } from 'node:crypto';
import { pool, withTransaction } from '../../shared/db.js';
import { erpProto, createJsonClient, rpc, startGrpcService } from '../../shared/grpc.js';
import { badRequest, forbidden, notFound } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';
import { safeDelete } from '../../shared/redis.js';
import { auditUserSecurity } from '../../shared/user-security-audit.js';

const authClient = createJsonClient(erpProto.AuthService, process.env.AUTH_GRPC_ADDR || '127.0.0.1:50051', 'auth');
function like(q) { return `%${String(q || '').trim().replace(/[\\%_]/g, '\\$&')}%`; }
async function assertAdmin(actorUserId) {
  const [rows] = await pool.execute('SELECT is_admin,is_active FROM users WHERE id=?', [actorUserId]);
  if (!rows[0] || !rows[0].is_active || !rows[0].is_admin) throw forbidden('Admin access required');
}

async function ensureProfilesExist() {
  try {
    const [dRows] = await pool.execute('SELECT id FROM departments ORDER BY id ASC LIMIT 1');
    const [pRows] = await pool.execute('SELECT id FROM programs ORDER BY id ASC LIMIT 1');
    const defaultDeptId = dRows[0]?.id;
    const defaultProgId = pRows[0]?.id;
    if (defaultDeptId && defaultProgId) {
      await pool.execute(`
        INSERT INTO student_profiles (user_id, enrollment_no, department_id, program_id, admission_year, current_year, current_semester, division)
        SELECT u.id,
               CONCAT('STU-', UPPER(SUBSTRING(REPLACE(u.id, '-', ''), 1, 6))),
               ?, ?, YEAR(CURRENT_DATE()), 1, 1, 'A'
        FROM users u
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        WHERE u.account_type = 'STUDENT' AND sp.user_id IS NULL
      `, [defaultDeptId, defaultProgId]);
    }
    if (defaultDeptId) {
      await pool.execute(`
        INSERT INTO faculty_profiles (user_id, employee_id, department_id, designation)
        SELECT u.id,
               CONCAT('FAC-', UPPER(SUBSTRING(REPLACE(u.id, '-', ''), 1, 6))),
               ?, 'Assistant Professor'
        FROM users u
        LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
        WHERE u.account_type = 'TEACHER' AND fp.user_id IS NULL
      `, [defaultDeptId]);
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'ensureProfilesExist background check failed');
  }
}

const handlers = {
  async listStudents({ actorUserId, search = '', departmentId, page = 1, pageSize = 25 }) {
    await assertAdmin(actorUserId);
    await ensureProfilesExist();
    const p = Math.max(1, Number(page) || 1); const n = Math.min(100, Math.max(1, Number(pageSize) || 25));
    const filters = ['u.account_type=\'STUDENT\'']; const args = [];
    if (search) { filters.push('(u.full_name LIKE ? OR u.email LIKE ? OR COALESCE(sp.enrollment_no, \'\') LIKE ?)'); args.push(like(search), like(search), like(search)); }
    if (departmentId) { filters.push('sp.department_id = ?'); args.push(departmentId); }
    const where = filters.join(' AND ');
    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM users u LEFT JOIN student_profiles sp ON sp.user_id=u.id WHERE ${where}`, args);
    const [rows] = await pool.execute(`SELECT u.id,u.email,u.full_name,u.is_active,
      COALESCE(sp.enrollment_no, CONCAT('STU-', SUBSTRING(u.id, 1, 8))) AS enrollment_no,
      sp.department_id,
      sp.program_id,
      COALESCE(d.name, 'General') AS department,
      COALESCE(p.name, 'General Degree') AS program,
      COALESCE(sp.admission_year, YEAR(u.created_at)) AS admission_year,
      COALESCE(sp.current_year, 1) AS current_year,
      COALESCE(sp.current_semester, 1) AS current_semester,
      COALESCE(sp.division, 'A') AS division,
      sp.phone,
      sp.avatar_public_id,
      attendance.attendance_percent,
      attendance.attendance_sessions
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id=u.id
    LEFT JOIN departments d ON d.id=sp.department_id
    LEFT JOIN programs p ON p.id=sp.program_id
    LEFT JOIN (
      SELECT ar.student_user_id,
             COUNT(*) AS attendance_sessions,
             ROUND(100.0 * SUM(CASE WHEN ar.status IN ('PRESENT','LATE') THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2) AS attendance_percent
      FROM attendance_records ar
      JOIN attendance_sessions ses ON ses.id=ar.session_id AND ses.status='FINALIZED'
      WHERE ar.status IN ('PRESENT','ABSENT','LATE')
      GROUP BY ar.student_user_id
    ) attendance ON attendance.student_user_id=u.id
    WHERE ${where}
    ORDER BY u.created_at DESC, u.full_name ASC
    LIMIT ${n} OFFSET ${(p - 1) * n}`, args);
    return { items: rows, page: p, pageSize: n, total: Number(countRows[0].total) };
  },
  async getStudent({ actorUserId, studentId }) {
    const [actorRows] = await pool.execute('SELECT id,is_admin,is_active FROM users WHERE id=?', [actorUserId]);
    if (!actorRows[0] || !actorRows[0].is_active || (!actorRows[0].is_admin && actorUserId !== studentId)) throw forbidden('Cannot view another student profile');
    const [rows] = await pool.execute(`SELECT u.id,u.email,u.full_name,u.is_active,
      COALESCE(sp.enrollment_no, CONCAT('STU-', SUBSTRING(u.id, 1, 8))) AS enrollment_no,
      sp.department_id, sp.program_id,
      COALESCE(d.name, 'General') AS department,
      COALESCE(p.name, 'General Degree') AS program,
      COALESCE(sp.admission_year, YEAR(u.created_at)) AS admission_year,
      COALESCE(sp.current_year, 1) AS current_year,
      COALESCE(sp.current_semester, 1) AS current_semester,
      COALESCE(sp.division, 'A') AS division,
      sp.phone, sp.date_of_birth, sp.address, sp.avatar_public_id
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id=u.id
    LEFT JOIN departments d ON d.id=sp.department_id
    LEFT JOIN programs p ON p.id=sp.program_id
    WHERE u.id=?`, [studentId]);
    if (!rows[0]) throw notFound('Student not found'); return rows[0];
  },
  async createStudent(input) {
    await assertAdmin(input.actorUserId);
    const { fullName,email,password,enrollmentNo,departmentId,programId } = input;
    if (!enrollmentNo || !departmentId || !programId) throw badRequest('enrollmentNo, departmentId, and programId are required');
    const user = await rpc(authClient, 'createUser', { actorUserId: input.actorUserId, fullName, email, password, accountType: 'STUDENT', isAdmin: false });
    try {
      await pool.execute(
        `INSERT INTO student_profiles (user_id,enrollment_no,department_id,program_id,admission_year,current_year,current_semester,division,phone,date_of_birth,address)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE enrollment_no=VALUES(enrollment_no), department_id=VALUES(department_id), program_id=VALUES(program_id), current_year=VALUES(current_year), current_semester=VALUES(current_semester), division=VALUES(division)`,
        [user.id, enrollmentNo, departmentId, programId, input.admissionYear || new Date().getFullYear(), input.currentYear || 1, input.currentSemester || 1, input.division || 'A', input.phone || null, input.dateOfBirth || null, input.address || null]
      );
      return { ...user, enrollmentNo, departmentId, programId };
    } catch (err) {
      try { await rpc(authClient, 'updateUserStatus', { actorUserId: input.actorUserId, userId: user.id, isActive: false }); } catch {}
      throw err;
    }
  },
  async updateStudent(input) {
    await assertAdmin(input.actorUserId);
    const { studentId, ...data } = input;
    const allowed = {
      fullName: 'UPDATE users SET full_name=? WHERE id=?',
      isActive: 'UPDATE users SET is_active=? WHERE id=?',
      departmentId: 'UPDATE student_profiles SET department_id=? WHERE user_id=?',
      programId: 'UPDATE student_profiles SET program_id=? WHERE user_id=?',
      currentYear: 'UPDATE student_profiles SET current_year=? WHERE user_id=?',
      currentSemester: 'UPDATE student_profiles SET current_semester=? WHERE user_id=?',
      division: 'UPDATE student_profiles SET division=? WHERE user_id=?',
      phone: 'UPDATE student_profiles SET phone=? WHERE user_id=?',
      address: 'UPDATE student_profiles SET address=? WHERE user_id=?',
    };
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (data.isActive !== undefined) {
        const [u] = await conn.execute('SELECT id, is_active, is_admin FROM users WHERE id = ? FOR UPDATE', [studentId]);
        if (u[0]) {
          await auditUserSecurity(conn, studentId, {
            oldValues: { is_active: u[0].is_active, is_admin: u[0].is_admin },
            newValues: { is_active: data.isActive }
          });
        }
      }
      for (const [key, value] of Object.entries(data)) {
        if (!allowed[key] || value === undefined) continue;
        await conn.execute(allowed[key], [value, studentId]);
      }
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
    if (typeof input.isActive === 'boolean') await safeDelete(`authz:${studentId}`);
    return handlers.getStudent({ actorUserId: input.actorUserId, studentId });
  },
  async deleteStudent({ actorUserId, studentId }) {
    await assertAdmin(actorUserId);
    if (!studentId) throw badRequest('studentId is required');

    const [target] = await pool.execute('SELECT id, full_name, email, account_type, is_admin FROM users WHERE id=?', [studentId]);
    if (!target[0]) throw notFound('Student not found');
    if (target[0].is_admin) throw forbidden('Cannot delete admin account');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Audit logs & appointments
      await conn.execute(`
        DELETE al FROM appointment_audit_logs al
        JOIN appointments a ON a.id = al.appointment_id
        WHERE a.student_user_id = ?
      `, [studentId]);

      await conn.execute('DELETE FROM appointments WHERE student_user_id = ?', [studentId]);

      // 2. Attendance followups & linked appointments/logs
      await conn.execute(`
        DELETE al FROM appointment_audit_logs al
        JOIN appointments a ON a.id = al.appointment_id
        JOIN student_attendance_followups f ON f.id = a.followup_id
        WHERE f.student_user_id = ?
      `, [studentId]);
      await conn.execute('DELETE FROM appointments WHERE followup_id IN (SELECT id FROM student_attendance_followups WHERE student_user_id = ?)', [studentId]);
      await conn.execute('DELETE FROM student_attendance_followups WHERE student_user_id = ?', [studentId]);

      // 3. Attendance records and audit logs
      await conn.execute('DELETE FROM attendance_audit_logs WHERE student_user_id = ?', [studentId]);
      await conn.execute('DELETE FROM attendance_records WHERE student_user_id = ?', [studentId]);

      // 4. Marks and marks audit logs
      await conn.execute('DELETE FROM marks_audit_logs WHERE student_user_id = ?', [studentId]);
      await conn.execute('DELETE FROM marks WHERE student_user_id = ?', [studentId]);

      // 5. Validation job errors
      await conn.execute('DELETE FROM mark_validation_job_errors WHERE student_user_id = ?', [studentId]);

      // 6. Enrollments
      await conn.execute('DELETE FROM enrollments WHERE student_user_id = ?', [studentId]);

      // 7. Notifications & Outbox
      await conn.execute('DELETE FROM student_notifications WHERE recipient_user_id = ?', [studentId]);
      await conn.execute('DELETE FROM notification_outbox_events WHERE recipient_user_id = ?', [studentId]);

      // 8. Auth tokens and security logs
      await conn.execute('DELETE FROM user_invitations WHERE user_id = ?', [studentId]);
      await conn.execute('DELETE FROM email_verifications WHERE user_id = ?', [studentId]);
      await conn.execute('DELETE FROM user_security_audit_logs WHERE user_id = ?', [studentId]);

      // 9. Profile and media assets
      await conn.execute('DELETE FROM student_profiles WHERE user_id = ?', [studentId]);
      await conn.execute('DELETE FROM media_assets WHERE owner_user_id = ?', [studentId]);

      // 10. User
      await conn.execute('DELETE FROM users WHERE id = ?', [studentId]);

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      logger.error({ err: err.message, studentId }, 'Failed to delete student account');
      throw err;
    } finally {
      conn.release();
    }

    await safeDelete(`authz:${studentId}`);
    await safeDelete(`authz:version:${studentId}`);
    return { success: true, message: `Student ${target[0].full_name} (${target[0].email}) deleted successfully`, id: studentId };
  },
  async listTeachers({ actorUserId, search = '', departmentId, page = 1, pageSize = 25 }) {
    await assertAdmin(actorUserId);
    await ensureProfilesExist();
    const p = Math.max(1, Number(page) || 1); const n = Math.min(100, Math.max(1, Number(pageSize) || 25));
    const filters = ['u.account_type=\'TEACHER\'']; const args = [];
    if (search) { filters.push('(u.full_name LIKE ? OR u.email LIKE ? OR COALESCE(fp.employee_id, \'\') LIKE ?)'); args.push(like(search), like(search), like(search)); }
    if (departmentId) { filters.push('fp.department_id = ?'); args.push(departmentId); }
    const where = filters.join(' AND ');
    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM users u LEFT JOIN faculty_profiles fp ON fp.user_id=u.id WHERE ${where}`, args);
    const [rows] = await pool.execute(`SELECT u.id,u.email,u.full_name,u.is_active,
      COALESCE(fp.employee_id, CONCAT('FAC-', SUBSTRING(u.id, 1, 8))) AS employee_id,
      fp.department_id,
      COALESCE(d.name, 'General') AS department,
      COALESCE(fp.designation, 'Faculty Member') AS designation,
      fp.qualification,
      fp.specialization,
      fp.joining_date,
      fp.phone,
      fp.office_location,
      fp.avatar_public_id
    FROM users u
    LEFT JOIN faculty_profiles fp ON fp.user_id=u.id
    LEFT JOIN departments d ON d.id=fp.department_id
    WHERE ${where}
    ORDER BY u.created_at DESC, u.full_name ASC
    LIMIT ${n} OFFSET ${(p - 1) * n}`, args);
    return { items: rows, page: p, pageSize: n, total: Number(countRows[0].total) };
  },
  async getTeacher({ actorUserId, teacherId }) {
    const [actorRows] = await pool.execute('SELECT id,account_type,is_admin,is_active FROM users WHERE id=?', [actorUserId]);
    if (!actorRows[0] || !actorRows[0].is_active || (!actorRows[0].is_admin && actorUserId !== teacherId)) throw forbidden('Cannot view another teacher profile');
    const [rows] = await pool.execute(`SELECT u.id,u.email,u.full_name,u.is_active,
      COALESCE(fp.employee_id, CONCAT('FAC-', SUBSTRING(u.id, 1, 8))) AS employee_id,
      fp.department_id,
      COALESCE(d.name, 'General') AS department,
      COALESCE(fp.designation, 'Faculty Member') AS designation,
      fp.qualification, fp.specialization, fp.joining_date, fp.phone, fp.office_location, fp.avatar_public_id
    FROM users u
    LEFT JOIN faculty_profiles fp ON fp.user_id=u.id
    LEFT JOIN departments d ON d.id=fp.department_id
    WHERE u.id=?`, [teacherId]);
    if (!rows[0]) throw notFound('Teacher not found');
    const [assignments] = await pool.execute(`SELECT ta.id,ta.class_subject_id,cs.class_section_id,cs.subject_id,s.code subject_code,s.name subject_name,cl.section_name,cl.year_of_study,sem.semester_number FROM teaching_assignments ta JOIN class_subjects cs ON cs.id=ta.class_subject_id JOIN subjects s ON s.id=cs.subject_id JOIN class_sections cl ON cl.id=cs.class_section_id JOIN semesters sem ON sem.id=cl.semester_id WHERE ta.teacher_user_id=? AND ta.status='ACTIVE'`, [teacherId]);
    return { ...rows[0], assignments };
  },
  async createTeacher(input) {
    await assertAdmin(input.actorUserId);
    const { fullName,email,password,employeeId,departmentId } = input;
    if (!employeeId || !departmentId) throw badRequest('employeeId and departmentId are required');
    const user = await rpc(authClient, 'createUser', { actorUserId: input.actorUserId, fullName, email, password, accountType: 'TEACHER', isAdmin: false });
    try {
      await pool.execute(
        `INSERT INTO faculty_profiles (user_id,employee_id,department_id,designation,qualification,specialization,joining_date,phone,office_location)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE employee_id=VALUES(employee_id), department_id=VALUES(department_id), designation=VALUES(designation)`,
        [user.id, employeeId, departmentId, input.designation || 'Assistant Professor', input.qualification || null, input.specialization || null, input.joiningDate || null, input.phone || null, input.officeLocation || null]
      );
      return { ...user, employeeId, departmentId };
    } catch (err) { try { await rpc(authClient, 'updateUserStatus', { actorUserId: input.actorUserId, userId: user.id, isActive: false }); } catch {} throw err; }
  },
  async updateTeacher(input) {
    await assertAdmin(input.actorUserId);
    const fields = {
      fullName: 'UPDATE users SET full_name=? WHERE id=?',
      isActive: 'UPDATE users SET is_active=? WHERE id=?',
      departmentId: 'UPDATE faculty_profiles SET department_id=? WHERE user_id=?',
      designation: 'UPDATE faculty_profiles SET designation=? WHERE user_id=?',
      qualification: 'UPDATE faculty_profiles SET qualification=? WHERE user_id=?',
      specialization: 'UPDATE faculty_profiles SET specialization=? WHERE user_id=?',
      phone: 'UPDATE faculty_profiles SET phone=? WHERE user_id=?',
      officeLocation: 'UPDATE faculty_profiles SET office_location=? WHERE user_id=?',
    };
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (input.isActive !== undefined) {
        const [u] = await conn.execute('SELECT id, is_active, is_admin FROM users WHERE id = ? FOR UPDATE', [input.teacherId]);
        if (u[0]) {
          await auditUserSecurity(conn, input.teacherId, {
            oldValues: { is_active: u[0].is_active, is_admin: u[0].is_admin },
            newValues: { is_active: input.isActive }
          });
        }
      }
      for (const [key,value] of Object.entries(input)) {
        if (key==='actorUserId'||key==='teacherId'||value===undefined||!fields[key]) continue;
        await conn.execute(fields[key],[value,input.teacherId]);
      }
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
    if (typeof input.isActive === 'boolean') await safeDelete(`authz:${input.teacherId}`);
    const [updated] = await pool.execute(`SELECT u.id,u.email,u.full_name,u.is_active,fp.*,d.name department FROM users u JOIN faculty_profiles fp ON fp.user_id=u.id JOIN departments d ON d.id=fp.department_id WHERE u.id=?`, [input.teacherId]);
    return updated[0];
  },
  async deleteTeacher({ actorUserId, teacherId }) {
    await assertAdmin(actorUserId);
    if (!teacherId) throw badRequest('teacherId is required');
    if (actorUserId === teacherId) throw forbidden('Cannot delete your own account');

    const [target] = await pool.execute('SELECT id, full_name, email, account_type, is_admin FROM users WHERE id=?', [teacherId]);
    if (!target[0]) throw notFound('Teacher not found');
    if (target[0].is_admin) throw forbidden('Cannot delete admin account');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Audit logs & appointments for this teacher
      await conn.execute(`
        DELETE al FROM appointment_audit_logs al
        JOIN appointments a ON a.id = al.appointment_id
        WHERE a.teacher_user_id = ?
      `, [teacherId]);
      await conn.execute('DELETE FROM appointments WHERE teacher_user_id = ?', [teacherId]);

      // 2. Availability slots
      await conn.execute('DELETE FROM teacher_availability_slots WHERE teacher_user_id = ?', [teacherId]);

      // 3. Reassign or clean followups assigned to this teacher
      const [otherFaculty] = await conn.execute('SELECT user_id FROM faculty_profiles WHERE user_id != ? LIMIT 1', [teacherId]);
      if (otherFaculty[0]?.user_id) {
        await conn.execute('UPDATE student_attendance_followups SET contact_teacher_user_id = ? WHERE contact_teacher_user_id = ?', [otherFaculty[0].user_id, teacherId]);
      } else {
        await conn.execute(`
          DELETE al FROM appointment_audit_logs al
          JOIN appointments a ON a.id = al.appointment_id
          JOIN student_attendance_followups f ON f.id = a.followup_id
          WHERE f.contact_teacher_user_id = ?
        `, [teacherId]);
        await conn.execute('DELETE FROM appointments WHERE followup_id IN (SELECT id FROM student_attendance_followups WHERE contact_teacher_user_id = ?)', [teacherId]);
        await conn.execute('DELETE FROM student_attendance_followups WHERE contact_teacher_user_id = ?', [teacherId]);
      }

      // 4. Teaching assignments
      await conn.execute('DELETE FROM teaching_assignments WHERE teacher_user_id = ?', [teacherId]);

      // 5. Jobs
      await conn.execute('DELETE FROM attendance_import_jobs WHERE teacher_user_id = ?', [teacherId]);
      await conn.execute('DELETE FROM mark_validation_jobs WHERE teacher_user_id = ?', [teacherId]);

      // 6. Reassign references in assessments, attendance, marks, papers, followups, audit
      await conn.execute('UPDATE assessments SET created_by_user_id = ? WHERE created_by_user_id = ?', [actorUserId, teacherId]);
      await conn.execute('UPDATE attendance_sessions SET marked_by_user_id = ? WHERE marked_by_user_id = ?', [actorUserId, teacherId]);
      await conn.execute('UPDATE attendance_records SET marked_by_user_id = ? WHERE marked_by_user_id = ?', [actorUserId, teacherId]);
      await conn.execute('UPDATE marks SET entered_by_user_id = ? WHERE entered_by_user_id = ?', [actorUserId, teacherId]);
      await conn.execute('UPDATE marks SET updated_by_user_id = ? WHERE updated_by_user_id = ?', [actorUserId, teacherId]);
      await conn.execute('UPDATE papers SET uploaded_by_user_id = ? WHERE uploaded_by_user_id = ?', [actorUserId, teacherId]);
      await conn.execute('UPDATE student_attendance_followups SET tagged_by_user_id = ? WHERE tagged_by_user_id = ?', [actorUserId, teacherId]);
      await conn.execute('UPDATE teaching_assignments SET assigned_by_user_id = ? WHERE assigned_by_user_id = ?', [actorUserId, teacherId]);
      await conn.execute('UPDATE marks_audit_logs SET changed_by_user_id = ? WHERE changed_by_user_id = ?', [actorUserId, teacherId]);
      await conn.execute('UPDATE attendance_audit_logs SET changed_by_user_id = ? WHERE changed_by_user_id = ?', [actorUserId, teacherId]);
      await conn.execute('UPDATE appointment_audit_logs SET actor_user_id = ? WHERE actor_user_id = ?', [actorUserId, teacherId]);
      await conn.execute('UPDATE appointments SET updated_by_user_id = ? WHERE updated_by_user_id = ?', [actorUserId, teacherId]);

      // 7. Notifications & Outbox
      await conn.execute('DELETE FROM student_notifications WHERE recipient_user_id = ?', [teacherId]);
      await conn.execute('DELETE FROM notification_outbox_events WHERE recipient_user_id = ?', [teacherId]);

      // 8. Auth tokens & security logs
      await conn.execute('DELETE FROM user_invitations WHERE user_id = ?', [teacherId]);
      await conn.execute('DELETE FROM email_verifications WHERE user_id = ?', [teacherId]);
      await conn.execute('DELETE FROM user_security_audit_logs WHERE user_id = ?', [teacherId]);

      // 9. Profile & media assets
      await conn.execute('DELETE FROM faculty_profiles WHERE user_id = ?', [teacherId]);
      await conn.execute('DELETE FROM media_assets WHERE owner_user_id = ?', [teacherId]);

      // 10. User
      await conn.execute('DELETE FROM users WHERE id = ?', [teacherId]);

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      logger.error({ err: err.message, teacherId }, 'Failed to delete teacher account');
      throw err;
    } finally {
      conn.release();
    }

    await safeDelete(`authz:${teacherId}`);
    await safeDelete(`authz:version:${teacherId}`);
    return { success: true, message: `Teacher ${target[0].full_name} (${target[0].email}) deleted successfully`, id: teacherId };
  },
  async getMyProfile({ actorUserId }) {
    let uRows;
    try {
      [uRows] = await pool.execute('SELECT id,email,full_name,account_type,is_admin,is_active,avatar_public_id,created_at FROM users WHERE id=? AND is_active=1 LIMIT 1', [actorUserId]);
    } catch {
      [uRows] = await pool.execute('SELECT id,email,full_name,account_type,is_admin,is_active,created_at FROM users WHERE id=? AND is_active=1 LIMIT 1', [actorUserId]);
    }
    const u = uRows[0];
    if (!u) throw notFound('User not found');
    if (u.account_type === 'STUDENT') {
      const [spRows] = await pool.execute(`SELECT sp.*, d.name department, p.name program FROM student_profiles sp LEFT JOIN departments d ON d.id=sp.department_id LEFT JOIN programs p ON p.id=sp.program_id WHERE sp.user_id=? LIMIT 1`, [actorUserId]);
      return { ...u, ...(spRows[0] || {}), avatar_public_id: u.avatar_public_id || spRows[0]?.avatar_public_id };
    } else if (u.account_type === 'TEACHER') {
      const [fpRows] = await pool.execute(`SELECT fp.*, d.name department FROM faculty_profiles fp LEFT JOIN departments d ON d.id=fp.department_id WHERE fp.user_id=? LIMIT 1`, [actorUserId]);
      const [assignments] = await pool.execute(`SELECT ta.id, s.name subject_name, s.code subject_code, cl.section_name, cl.year_of_study, sem.semester_number FROM teaching_assignments ta JOIN class_subjects cs ON cs.id=ta.class_subject_id JOIN subjects s ON s.id=cs.subject_id JOIN class_sections cl ON cl.id=cs.class_section_id JOIN semesters sem ON sem.id=cl.semester_id WHERE ta.teacher_user_id=? AND ta.status='ACTIVE'`, [actorUserId]);
      return { ...u, ...(fpRows[0] || {}), assignments, avatar_public_id: u.avatar_public_id || fpRows[0]?.avatar_public_id };
    }
    return u;
  },
  async updateMyProfile(input) {
    const { actorUserId, fullName, phone, address, officeLocation, specialization } = input;
    const [uRows] = await pool.execute('SELECT id,account_type FROM users WHERE id=? AND is_active=1 LIMIT 1', [actorUserId]);
    const u = uRows[0];
    if (!u) throw notFound('User not found');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (fullName) {
        await conn.execute('UPDATE users SET full_name=? WHERE id=?', [fullName.trim(), actorUserId]);
      }
      if (u.account_type === 'STUDENT') {
        if (phone !== undefined) await conn.execute('UPDATE student_profiles SET phone=? WHERE user_id=?', [phone, actorUserId]);
        if (address !== undefined) await conn.execute('UPDATE student_profiles SET address=? WHERE user_id=?', [address, actorUserId]);
      } else if (u.account_type === 'TEACHER') {
        if (phone !== undefined) await conn.execute('UPDATE faculty_profiles SET phone=? WHERE user_id=?', [phone, actorUserId]);
        if (officeLocation !== undefined) await conn.execute('UPDATE faculty_profiles SET office_location=? WHERE user_id=?', [officeLocation, actorUserId]);
        if (specialization !== undefined) await conn.execute('UPDATE faculty_profiles SET specialization=? WHERE user_id=?', [specialization, actorUserId]);
      }
      await conn.commit();
    } catch(err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return handlers.getMyProfile({ actorUserId });
  },
  async updateAvatar({ actorUserId, userId, publicId }) {
    const [actor] = await pool.execute('SELECT account_type,is_admin FROM users WHERE id=? AND is_active=1', [actorUserId]);
    if (!actor[0] || (!actor[0].is_admin && actorUserId !== userId)) throw forbidden('Cannot update another user avatar');
    const [user] = await pool.execute('SELECT account_type FROM users WHERE id=?', [userId]); if (!user[0]) throw notFound('User not found');
    const avatarUpdate = user[0].account_type === 'STUDENT'
      ? 'UPDATE student_profiles SET avatar_public_id=? WHERE user_id=?'
      : user[0].account_type === 'TEACHER'
        ? 'UPDATE faculty_profiles SET avatar_public_id=? WHERE user_id=?'
        : null;
    if (!avatarUpdate) throw badRequest('Only student and teacher profiles support avatars');
    await pool.execute(avatarUpdate, [publicId, userId]);
    return { userId, publicId };
  },
};

startGrpcService({ name: 'profile-service', serviceName: 'profile', address: process.env.PROFILE_GRPC_ADDR || '127.0.0.1:50052', Service: erpProto.ProfileService, handlers });
logger.info('Profile service initialized');
