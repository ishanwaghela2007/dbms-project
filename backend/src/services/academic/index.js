import { randomUUID } from 'node:crypto';
import { pool } from '../../shared/db.js';
import { erpProto, startGrpcService } from '../../shared/grpc.js';
import { badRequest, forbidden, notFound } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';

async function isAdmin(id) { const [r] = await pool.execute('SELECT is_admin FROM users WHERE id=? AND is_active=1', [id]); return Boolean(r[0]?.is_admin); }
async function requireAdmin(id) { if (!(await isAdmin(id))) throw forbidden('Admin access required'); }
async function requireAssignedTeacher(actorUserId, classSubjectId) {
  const [rows] = await pool.execute(`SELECT id FROM teaching_assignments WHERE teacher_user_id=? AND class_subject_id=? AND status='ACTIVE' LIMIT 1`, [actorUserId,classSubjectId]);
  if (!rows[0] && !(await isAdmin(actorUserId))) throw forbidden('Teacher is not assigned to this class subject');
}
const handlers = {
  async resolveAcademicRefs(input) {
    if (!input.departmentName && !input.programName) throw badRequest('departmentName or programName required');
    let department = null; let program = null;
    if (input.departmentName) { const [d] = await pool.execute('SELECT id,code,name FROM departments WHERE LOWER(name)=LOWER(?) OR LOWER(code)=LOWER(?) LIMIT 1',[input.departmentName,input.departmentName]); department=d[0]||null; }
    if (input.programName) { const [p] = await pool.execute('SELECT id,department_id,code,name FROM programs WHERE LOWER(name)=LOWER(?) OR LOWER(code)=LOWER(?) LIMIT 1',[input.programName,input.programName]); program=p[0]||null; }
    if (!department && program) { const [d] = await pool.execute('SELECT id,code,name FROM departments WHERE id=?',[program.department_id]); department=d[0]||null; }
    if (program && department && program.department_id!==department.id) throw badRequest('Selected program does not belong to the requested department');
    if (!department && input.departmentName) throw notFound(`Department not found: ${input.departmentName}`);
    if (!program && input.programName) throw notFound(`Program not found: ${input.programName}`);
    return { departmentId: department?.id || null, departmentName: department?.name || null, programId: program?.id || null, programName: program?.name || null };
  },
  async autoEnrollStudent(input) {
    await requireAdmin(input.actorUserId);
    const [profileRows]=await pool.execute('SELECT program_id,current_year,current_semester,division FROM student_profiles WHERE user_id=?',[input.studentUserId]); const profile=profileRows[0];
    if(!profile) throw notFound('Student profile not found');
    if(!profile.current_year || !profile.current_semester || !profile.division) return {enrolled:false,warning:'Current year, semester and division are required for automatic class enrollment'};
    const [classes]=await pool.execute(`SELECT cl.id FROM class_sections cl JOIN academic_years ay ON ay.id=cl.academic_year_id JOIN semesters sem ON sem.id=cl.semester_id WHERE cl.program_id=? AND cl.year_of_study=? AND sem.semester_number=? AND cl.section_name=? AND ay.is_current=1 LIMIT 1`,[profile.program_id,profile.current_year,profile.current_semester,profile.division]);
    if(!classes[0]) return {enrolled:false,warning:'No matching class section exists for the current academic year'};
    const [existing]=await pool.execute('SELECT id FROM enrollments WHERE student_user_id=? AND class_section_id=?',[input.studentUserId,classes[0].id]);
    if(existing[0]) return {enrolled:true,enrollmentId:existing[0].id,classSectionId:classes[0].id,reused:true};
    const id=randomUUID(); await pool.execute("INSERT INTO enrollments (id,student_user_id,class_section_id,status) VALUES (?,?,?,'ACTIVE')",[id,input.studentUserId,classes[0].id]);
    return {enrolled:true,enrollmentId:id,classSectionId:classes[0].id};
  },
  async resolveTeachingAssignment(input) {
    await requireAdmin(input.actorUserId);
    const [teachers]=await pool.execute(`SELECT u.id,user_name.full_name FROM users u JOIN faculty_profiles fp ON fp.user_id=u.id JOIN (SELECT id,full_name FROM users) user_name ON user_name.id=u.id WHERE u.account_type='TEACHER' AND u.is_active=1 AND LOWER(u.full_name)=LOWER(?) LIMIT 1`,[input.teacherName]);
    if(!teachers[0]) throw notFound(`Teacher not found: ${input.teacherName}`);
    const [subjects]=await pool.execute('SELECT id,program_id,name FROM subjects WHERE LOWER(name)=LOWER(?) AND is_active=1 LIMIT 1',[input.subjectName]); if(!subjects[0]) throw notFound(`Subject not found: ${input.subjectName}`);
    const classMatch=String(input.className||'').match(/^(FY|SY|TY|Final Year|First Year|Second Year|Third Year)\s+(.*?)\s*·\s*([A-Za-z0-9]+)$/i);
    if(!classMatch) throw badRequest('className must look like "SY B.Tech CSE · A"');
    const yrLabel=classMatch[1].toUpperCase(); const yearOfStudy=({FY:1,'FIRST YEAR':1,SY:2,'SECOND YEAR':2,TY:3,'THIRD YEAR':3,'FINAL YEAR':4})[yrLabel];
    const programName=classMatch[2].trim(); const sectionName=classMatch[3].trim();
    const semMatch=String(input.semester||'').match(/(\d+)/); if(!semMatch) throw badRequest('semester must include a semester number'); const semesterNumber=Number(semMatch[1]);
    const [programs]=await pool.execute('SELECT id FROM programs WHERE LOWER(name)=LOWER(?) LIMIT 1',[programName]); if(!programs[0]) throw notFound(`Program not found: ${programName}`);
    const yearText=String(input.year||'').replace(/[–—]/g,'-').replace(/\s/g,'');
    const [classes]=await pool.execute(`SELECT cl.id classSectionId,cs.id classSubjectId,cs.academic_year_id academicYearId,s.id subjectId,ay.label academicYear FROM class_sections cl JOIN semesters sem ON sem.id=cl.semester_id JOIN academic_years ay ON ay.id=cl.academic_year_id JOIN class_subjects cs ON cs.class_section_id=cl.id JOIN subjects s ON s.id=cs.subject_id WHERE cl.program_id=? AND cl.year_of_study=? AND cl.section_name=? AND sem.semester_number=? AND s.id=? AND (REPLACE(REPLACE(ay.label,'–','-'),' ','')=? OR ay.is_current=1) ORDER BY ay.is_current DESC LIMIT 1`,[programs[0].id,yearOfStudy,sectionName,semesterNumber,subjects[0].id,yearText]);
    if(!classes[0]) throw notFound('Matching class, semester, academic-year, and subject offering not found');
    return {teacherUserId:teachers[0].id,...classes[0],subjectName:subjects[0].name};
  },
  async createDepartment(input) {
    await requireAdmin(input.actorUserId); if (!input.code || !input.name) throw badRequest('code and name are required');
    const id=randomUUID(); await pool.execute('INSERT INTO departments (id,code,name) VALUES (?,?,?)',[id,String(input.code).toUpperCase(),input.name]); return {id,code:String(input.code).toUpperCase(),name:input.name};
  },
  async listDepartments(input) {
    if (!(await isAdmin(input.actorUserId))) throw forbidden('Admin access required'); const [rows]=await pool.execute('SELECT id,code,name FROM departments ORDER BY name'); return {items:rows};
  },
  async createProgram(input) {
    await requireAdmin(input.actorUserId); if (!input.code||!input.name||!input.departmentId) throw badRequest('code, name, departmentId are required');
    const id=randomUUID(); await pool.execute('INSERT INTO programs (id,department_id,code,name,duration_years) VALUES (?,?,?,?,?)',[id,input.departmentId,String(input.code).toUpperCase(),input.name,input.durationYears||4]); return {id,...input};
  },
  async createAcademicYear(input) {
    await requireAdmin(input.actorUserId); if(!input.label||!input.startsOn||!input.endsOn) throw badRequest('label, startsOn, endsOn required');
    const id=randomUUID(); if(input.isCurrent) await pool.execute('UPDATE academic_years SET is_current=0'); await pool.execute('INSERT INTO academic_years (id,label,starts_on,ends_on,is_current) VALUES (?,?,?,?,?)',[id,input.label,input.startsOn,input.endsOn,Boolean(input.isCurrent)]); return {id,...input};
  },
  async createSemester(input) {
    await requireAdmin(input.actorUserId); if(!input.programId||!input.semesterNumber) throw badRequest('programId and semesterNumber required');
    const id=randomUUID(); const label=input.label||`Semester ${input.semesterNumber}`; await pool.execute('INSERT INTO semesters (id,program_id,semester_number,label) VALUES (?,?,?,?)',[id,input.programId,input.semesterNumber,label]); return {id,programId:input.programId,semesterNumber:input.semesterNumber,label};
  },
  async createClassSection(input) {
    await requireAdmin(input.actorUserId); const {programId,academicYearId,yearOfStudy,semesterId,sectionName}=input; if(!programId||!academicYearId||!yearOfStudy||!semesterId||!sectionName) throw badRequest('programId, academicYearId, yearOfStudy, semesterId, sectionName required');
    const id=randomUUID(); await pool.execute('INSERT INTO class_sections (id,program_id,academic_year_id,year_of_study,semester_id,section_name) VALUES (?,?,?,?,?,?)',[id,programId,academicYearId,yearOfStudy,semesterId,sectionName]); return {id,...input};
  },
  async createSubject(input) {
    await requireAdmin(input.actorUserId); if(!input.programId||!input.code||!input.name) throw badRequest('programId, code and name required'); const id=randomUUID();
    await pool.execute('INSERT INTO subjects (id,program_id,code,name,credits) VALUES (?,?,?,?,?)',[id,input.programId,String(input.code).toUpperCase(),input.name,input.credits||0]); return {id,...input};
  },
  async createClassSubject(input) {
    await requireAdmin(input.actorUserId); if(!input.classSectionId||!input.subjectId||!input.academicYearId) throw badRequest('classSectionId, subjectId, academicYearId required'); const id=randomUUID();
    await pool.execute('INSERT INTO class_subjects (id,class_section_id,subject_id,academic_year_id) VALUES (?,?,?,?)',[id,input.classSectionId,input.subjectId,input.academicYearId]); return {id,...input};
  },
  async createTeachingAssignment(input) {
    await requireAdmin(input.actorUserId); if(!input.teacherUserId||!input.classSubjectId) throw badRequest('teacherUserId and classSubjectId required'); const id=randomUUID();
    await pool.execute('INSERT INTO teaching_assignments (id,teacher_user_id,class_subject_id,assigned_by_user_id,status) VALUES (?,?,?,? ,\'ACTIVE\')',[id,input.teacherUserId,input.classSubjectId,input.actorUserId]); return {id,...input,status:'ACTIVE'};
  },
  async listTeachingAssignments(input) {
    if (!(await isAdmin(input.actorUserId))) throw forbidden('Admin access required'); const where=input.teacherUserId?'WHERE ta.teacher_user_id=?':''; const args=input.teacherUserId?[input.teacherUserId]:[];
    const [rows]=await pool.execute(`SELECT ta.id,ta.teacher_user_id,ta.class_subject_id,ta.status,u.full_name teacher_name,fp.employee_id,cs.subject_id,s.code subject_code,s.name subject_name,cl.section_name,cl.year_of_study,p.name program_name,sem.semester_number,ay.label academic_year FROM teaching_assignments ta JOIN users u ON u.id=ta.teacher_user_id JOIN faculty_profiles fp ON fp.user_id=u.id JOIN class_subjects cs ON cs.id=ta.class_subject_id JOIN subjects s ON s.id=cs.subject_id JOIN class_sections cl ON cl.id=cs.class_section_id JOIN programs p ON p.id=cl.program_id JOIN semesters sem ON sem.id=cl.semester_id JOIN academic_years ay ON ay.id=cs.academic_year_id ${where} ORDER BY u.full_name,s.name`,args); return {items:rows};
  },
  async listClasses(input) {
    const admin = await isAdmin(input.actorUserId);
    const where = admin ? '' : `WHERE ta.teacher_user_id=? AND ta.status='ACTIVE'`;
    const args = admin ? [] : [input.actorUserId];
    const [rows]=await pool.execute(`SELECT DISTINCT cs.id class_subject_id,cl.id class_section_id,cl.section_name,cl.year_of_study,sem.semester_number,p.name program_name,ay.label academic_year,s.id subject_id,s.code subject_code,s.name subject_name FROM class_subjects cs JOIN class_sections cl ON cl.id=cs.class_section_id JOIN programs p ON p.id=cl.program_id JOIN semesters sem ON sem.id=cl.semester_id JOIN academic_years ay ON ay.id=cs.academic_year_id JOIN subjects s ON s.id=cs.subject_id LEFT JOIN teaching_assignments ta ON ta.class_subject_id=cs.id ${where} ORDER BY cl.year_of_study,cl.section_name,s.name`,args); return {items:rows};
  },
  async listSubjects(input) {
    if (!(await isAdmin(input.actorUserId))) throw forbidden('Admin access required'); const [rows]=await pool.execute(`SELECT s.id,s.code,s.name,s.credits,p.id program_id,p.name program_name FROM subjects s JOIN programs p ON p.id=s.program_id WHERE s.is_active=1 ORDER BY p.name,s.name`); return {items:rows};
  },
  async getClassRoster(input) {
    const {actorUserId}=input; let classSubjectId=input.classSubjectId;
    if (!classSubjectId && input.classSectionId && input.subjectId) { const [match] = await pool.execute('SELECT id FROM class_subjects WHERE class_section_id=? AND subject_id=? LIMIT 1',[input.classSectionId,input.subjectId]); classSubjectId=match[0]?.id; }
    if (!classSubjectId) throw notFound('Class-subject offering not found');
    await requireAssignedTeacher(actorUserId,classSubjectId);
    const [rows]=await pool.execute(`SELECT u.id student_user_id,u.full_name,u.email,sp.enrollment_no roll_no,ar.status attendance_status FROM class_subjects cs JOIN enrollments e ON e.class_section_id=cs.class_section_id AND e.status='ACTIVE' JOIN student_profiles sp ON sp.user_id=e.student_user_id JOIN users u ON u.id=sp.user_id LEFT JOIN (SELECT r.student_user_id,r.status FROM attendance_records r JOIN attendance_sessions ses ON ses.id=r.session_id WHERE ses.class_subject_id=? AND ses.session_date=(SELECT MAX(session_date) FROM attendance_sessions WHERE class_subject_id=?)) ar ON ar.student_user_id=u.id WHERE cs.id=? ORDER BY sp.enrollment_no`,[classSubjectId,classSubjectId,classSubjectId]); return {items:rows};
  },
  async enrollStudent(input) {
    await requireAdmin(input.actorUserId); if(!input.studentUserId||!input.classSectionId) throw badRequest('studentUserId and classSectionId required'); const id=randomUUID();
    await pool.execute('INSERT INTO enrollments (id,student_user_id,class_section_id,status) VALUES (?,?,?,\'ACTIVE\')',[id,input.studentUserId,input.classSectionId]); return {id,...input,status:'ACTIVE'};
  }
};

startGrpcService({name:'academic-service',address:process.env.ACADEMIC_GRPC_ADDR||'127.0.0.1:50053',Service:erpProto.AcademicService,handlers});
logger.info('Academic service initialized');
