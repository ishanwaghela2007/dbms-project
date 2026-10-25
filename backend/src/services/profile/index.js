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

const handlers = {
  async listStudents({ actorUserId, search = '', departmentId, page = 1, pageSize = 25 }) {
    await assertAdmin(actorUserId);
    const p = Math.max(1, Number(page) || 1); const n = Math.min(100, Math.max(1, Number(pageSize) || 25));
    const filters = ['u.account_type=\'STUDENT\'']; const args = [];
    if (search) { filters.push('(u.full_name LIKE ? OR u.email LIKE ? OR sp.enrollment_no LIKE ?)'); args.push(like(search), like(search), like(search)); }
    if (departmentId) { filters.push('sp.department_id = ?'); args.push(departmentId); }
    const where = filters.join(' AND ');
    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM users u JOIN student_profiles sp ON sp.user_id=u.id WHERE ${where}`, args);
    const [rows] = await pool.execute(`SELECT u.id,u.email,u.full_name,u.is_active,sp.enrollment_no,sp.department_id,sp.program_id,d.name department,p.name program,sp.admission_year,sp.current_year,sp.current_semester,sp.division,sp.phone,sp.avatar_public_id,attendance.attendance_percent,attendance.attendance_sessions FROM users u JOIN student_profiles sp ON sp.user_id=u.id JOIN departments d ON d.id=sp.department_id JOIN programs p ON p.id=sp.program_id LEFT JOIN (SELECT ar.student_user_id,COUNT(*) attendance_sessions,ROUND(100.0*SUM(CASE WHEN ar.status IN ('PRESENT','LATE') THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0),2) attendance_percent FROM attendance_records ar JOIN attendance_sessions ses ON ses.id=ar.session_id AND ses.status='FINALIZED' WHERE ar.status IN ('PRESENT','ABSENT','LATE') GROUP BY ar.student_user_id) attendance ON attendance.student_user_id=u.id WHERE ${where} ORDER BY u.full_name LIMIT ? OFFSET ?`, [...args, n, (p - 1) * n]);
    return { items: rows, page: p, pageSize: n, total: Number(countRows[0].total) };
  },
  async getStudent({ actorUserId, studentId }) {
    const [actorRows] = await pool.execute('SELECT id,is_admin,is_active FROM users WHERE id=?', [actorUserId]);
    if (!actorRows[0] || !actorRows[0].is_active || (!actorRows[0].is_admin && actorUserId !== studentId)) throw forbidden('Cannot view another student profile');
    const [rows] = await pool.execute(`SELECT u.id,u.email,u.full_name,u.is_active,sp.*,d.name department,p.name program FROM users u JOIN student_profiles sp ON sp.user_id=u.id JOIN departments d ON d.id=sp.department_id JOIN programs p ON p.id=sp.program_id WHERE u.id=?`, [studentId]);
    if (!rows[0]) throw notFound('Student not found'); return rows[0];
  },
  async createStudent(input) {
    await assertAdmin(input.actorUserId);
    const { fullName,email,password,enrollmentNo,departmentId,programId } = input;
    if (!enrollmentNo || !departmentId || !programId) throw badRequest('enrollmentNo, departmentId, and programId are required');
    const user = await rpc(authClient, 'createUser', { actorUserId: input.actorUserId, fullName, email, password, accountType: 'STUDENT', isAdmin: false });
    try {
      await pool.execute(`INSERT INTO student_profiles (user_id,enrollment_no,department_id,program_id,admission_year,current_year,current_semester,division,phone,date_of_birth,address) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [user.id, enrollmentNo, departmentId, programId, input.admissionYear || null, input.currentYear || null, input.currentSemester || null, input.division || null, input.phone || null, input.dateOfBirth || null, input.address || null]);
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
    const [updated] = await pool.execute(`SELECT u.id,u.email,u.full_name,u.is_active,sp.*,d.name department,p.name program FROM users u JOIN student_profiles sp ON sp.user_id=u.id JOIN departments d ON d.id=sp.department_id JOIN programs p ON p.id=sp.program_id WHERE u.id=?`, [studentId]);
    return updated[0];
  },
  async listTeachers({ actorUserId, search = '', departmentId, page = 1, pageSize = 25 }) {
    await assertAdmin(actorUserId);
    const p = Math.max(1, Number(page) || 1); const n = Math.min(100, Math.max(1, Number(pageSize) || 25));
    const filters = ['u.account_type=\'TEACHER\'']; const args = [];
    if (search) { filters.push('(u.full_name LIKE ? OR u.email LIKE ? OR fp.employee_id LIKE ?)'); args.push(like(search), like(search), like(search)); }
    if (departmentId) { filters.push('fp.department_id = ?'); args.push(departmentId); }
    const where = filters.join(' AND ');
    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM users u JOIN faculty_profiles fp ON fp.user_id=u.id WHERE ${where}`, args);
    const [rows] = await pool.execute(`SELECT u.id,u.email,u.full_name,u.is_active,fp.employee_id,fp.department_id,d.name department,fp.designation,fp.qualification,fp.specialization,fp.joining_date,fp.phone,fp.office_location,fp.avatar_public_id FROM users u JOIN faculty_profiles fp ON fp.user_id=u.id JOIN departments d ON d.id=fp.department_id WHERE ${where} ORDER BY u.full_name LIMIT ? OFFSET ?`, [...args, n, (p-1)*n]);
    return { items: rows, page: p, pageSize: n, total: Number(countRows[0].total) };
  },
  async getTeacher({ actorUserId, teacherId }) {
    const [actorRows] = await pool.execute('SELECT id,account_type,is_admin,is_active FROM users WHERE id=?', [actorUserId]);
    if (!actorRows[0] || !actorRows[0].is_active || (!actorRows[0].is_admin && actorUserId !== teacherId)) throw forbidden('Cannot view another teacher profile');
    const [rows] = await pool.execute(`SELECT u.id,u.email,u.full_name,u.is_active,fp.*,d.name department FROM users u JOIN faculty_profiles fp ON fp.user_id=u.id JOIN departments d ON d.id=fp.department_id WHERE u.id=?`, [teacherId]);
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
      await pool.execute(`INSERT INTO faculty_profiles (user_id,employee_id,department_id,designation,qualification,specialization,joining_date,phone,office_location) VALUES (?,?,?,?,?,?,?,?,?)`, [user.id, employeeId, departmentId, input.designation || null, input.qualification || null, input.specialization || null, input.joiningDate || null, input.phone || null, input.officeLocation || null]);
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
  async getMyProfile({ actorUserId }) {
    const [uRows] = await pool.execute('SELECT id,email,full_name,account_type,is_admin,is_active,avatar_public_id,created_at FROM users WHERE id=? AND is_active=1 LIMIT 1', [actorUserId]);
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
