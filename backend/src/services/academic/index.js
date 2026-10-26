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
    const cleanStr = (s) => String(s || '').trim();
    const deptInput = cleanStr(input.departmentName);
    const progInput = cleanStr(input.programName);

    // Map common branch codes
    const branchMap = {
      'CSE': { dept: 'Computer Science and Engineering', prog: 'B.Tech Computer Science and Engineering' },
      'CE': { dept: 'Computer Engineering', prog: 'B.Tech Computer Engineering' },
      'EXTC': { dept: 'Electronics and Telecommunication Engineering', prog: 'B.Tech Electronics and Telecommunication Engineering' },
      'IT': { dept: 'Information Technology', prog: 'B.Tech Information Technology' },
    };

    const mappedDept = branchMap[deptInput.toUpperCase()]?.dept || deptInput;
    const mappedProg = branchMap[progInput.toUpperCase()]?.prog || progInput;

    if (mappedDept) {
      const [d] = await pool.execute(
        'SELECT id,code,name FROM departments WHERE LOWER(name)=LOWER(?) OR LOWER(code)=LOWER(?) OR LOWER(name) LIKE ? LIMIT 1',
        [mappedDept, mappedDept, `%${mappedDept}%`]
      );
      department = d[0] || null;
    }
    if (mappedProg) {
      const [p] = await pool.execute(
        'SELECT id,department_id,code,name FROM programs WHERE LOWER(name)=LOWER(?) OR LOWER(code)=LOWER(?) OR LOWER(name) LIKE ? LIMIT 1',
        [mappedProg, mappedProg, `%${mappedProg}%`]
      );
      program = p[0] || null;
    }
    if (!department && program) {
      const [d] = await pool.execute('SELECT id,code,name FROM departments WHERE id=?', [program.department_id]);
      department = d[0] || null;
    }
    if (!program && department) {
      const [p] = await pool.execute('SELECT id,department_id,code,name FROM programs WHERE department_id=? LIMIT 1', [department.id]);
      program = p[0] || null;
    }
    return {
      departmentId: department?.id || null,
      departmentName: department?.name || null,
      programId: program?.id || null,
      programName: program?.name || null
    };
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
    const [teachers] = await pool.execute(
      `SELECT u.id, u.full_name FROM users u 
       JOIN faculty_profiles fp ON fp.user_id=u.id 
       WHERE u.account_type='TEACHER' AND u.is_active=1 
         AND (LOWER(u.full_name)=LOWER(?) OR LOWER(u.email)=LOWER(?) OR u.id=?) 
       LIMIT 1`,
      [input.teacherName, input.teacherName, input.teacherName]
    );
    if (!teachers[0]) throw notFound(`Teacher not found: ${input.teacherName}`);

    // Parse semester number (1 through 8)
    const semMatch = String(input.semester || '').match(/(\d+)/);
    if (!semMatch) throw badRequest('semester must include a semester number (1 to 8)');
    const semesterNumber = Number(semMatch[1]);
    const inferredYear = Math.ceil(semesterNumber / 2) || 1;

    // Parse class name e.g. "SY B.Tech Computer Science and Engineering · A"
    const classMatch = String(input.className || '').match(/^(FY|SY|TY|Final Year|First Year|Second Year|Third Year|B\.Tech|Year\s*\d+)?\s*(.*?)\s*[·•-]\s*([A-Za-z0-9]+)$/i);
    let yearOfStudy = inferredYear;
    let programName = String(input.className || '').trim();
    let sectionName = 'A';

    if (classMatch) {
      const yrLabel = (classMatch[1] || '').toUpperCase().trim();
      if (yrLabel) {
        yearOfStudy = ({
          FY: 1, 'FIRST YEAR': 1, 'YEAR 1': 1,
          SY: 2, 'SECOND YEAR': 2, 'YEAR 2': 2,
          TY: 3, 'THIRD YEAR': 3, 'YEAR 3': 3,
          'FINAL YEAR': 4, 'B.TECH': 4, 'YEAR 4': 4
        })[yrLabel] || inferredYear;
      }
      programName = (classMatch[2] || '').trim();
      sectionName = (classMatch[3] || 'A').toUpperCase().trim();
    }

    // Resolve Program with flexible alias matching
    const [programs] = await pool.execute(
      `SELECT id, name, code FROM programs 
       WHERE LOWER(name)=LOWER(?) 
          OR LOWER(code)=LOWER(?)
          OR LOWER(name)=LOWER(CONCAT('B.Tech ', ?))
          OR LOWER(REPLACE(name, 'B.Tech ', ''))=LOWER(REPLACE(?, 'B.Tech ', ''))
          OR (LOWER(?) LIKE '%cse%' AND (LOWER(code) LIKE '%cse%' OR LOWER(name) LIKE '%computer science%'))
          OR (LOWER(?) LIKE '%extc%' AND (LOWER(code) LIKE '%extc%' OR LOWER(name) LIKE '%telecom%'))
          OR (LOWER(?) LIKE '%computer%' AND (LOWER(code) LIKE '%ce%' OR LOWER(name) LIKE '%computer engineering%'))
       ORDER BY (LOWER(name)=LOWER(?)) DESC LIMIT 1`,
      [programName, programName, programName, programName, programName, programName, programName, programName]
    );

    let programId = programs[0]?.id;
    if (!programId) {
      // Fallback to first available program
      const [firstProg] = await pool.execute('SELECT id, name FROM programs LIMIT 1');
      if (!firstProg[0]) throw notFound(`Program not found for: ${programName}`);
      programId = firstProg[0].id;
    }

    // Clean subject name & extract subject code if present
    let rawSubj = String(input.subjectName || '').trim();
    let subjCode = '';
    let cleanSubjName = rawSubj;

    if (rawSubj.includes('·')) {
      const parts = rawSubj.split('·');
      subjCode = parts[0].trim();
      cleanSubjName = parts[1].trim();
    } else if (rawSubj.includes(' - ')) {
      const parts = rawSubj.split(' - ');
      subjCode = parts[0].trim();
      cleanSubjName = parts[1].trim();
    } else {
      const codeMatch = rawSubj.match(/^([A-Za-z]{2,5}\d{3}[A-Za-z0-9/]*)\s+(.*)$/);
      if (codeMatch) {
        subjCode = codeMatch[1].trim();
        cleanSubjName = codeMatch[2].trim();
      }
    }

    // Resolve subject
    let [subjects] = await pool.execute(
      `SELECT id, program_id, name, code FROM subjects 
       WHERE (LOWER(name)=LOWER(?) OR LOWER(name)=LOWER(?) OR (code=? AND code!='')) 
         AND is_active=1 
       ORDER BY (program_id=?) DESC LIMIT 1`,
      [cleanSubjName, rawSubj, subjCode, programId]
    );

    let subjectId = subjects[0]?.id;
    let resolvedSubjectName = subjects[0]?.name || cleanSubjName;

    if (!subjectId) {
      // Auto-create subject under program if not present
      subjectId = randomUUID();
      const codeToUse = subjCode || `SUB${semesterNumber}01`;
      await pool.execute(
        `INSERT INTO subjects (id, program_id, code, name, credits, is_active) VALUES (?, ?, ?, ?, 3, 1)`,
        [subjectId, programId, codeToUse, cleanSubjName]
      );
      resolvedSubjectName = cleanSubjName;
    }

    // Resolve Academic Year
    const yearText = String(input.year || '2026–27').replace(/[–—]/g, '-').replace(/\s/g, '');
    let [ayRows] = await pool.execute(
      `SELECT id, label FROM academic_years 
       WHERE REPLACE(REPLACE(label, '–', '-'), ' ', '')=? OR is_current=1 
       ORDER BY is_current DESC LIMIT 1`,
      [yearText]
    );

    let academicYearId = ayRows[0]?.id;
    let academicYearLabel = ayRows[0]?.label || '2026–27';
    if (!academicYearId) {
      academicYearId = randomUUID();
      await pool.execute(
        `INSERT INTO academic_years (id, label, starts_on, ends_on, is_current) VALUES (?, '2026–27', '2026-07-01', '2027-06-30', 1)`,
        [academicYearId]
      );
    }

    // Ensure Semester exists (1 to 8)
    let [semRows] = await pool.execute(
      `SELECT id FROM semesters WHERE program_id=? AND semester_number=? LIMIT 1`,
      [programId, semesterNumber]
    );
    let semesterId = semRows[0]?.id;
    if (!semesterId) {
      semesterId = randomUUID();
      await pool.execute(
        `INSERT INTO semesters (id, program_id, semester_number, label) VALUES (?, ?, ?, ?)`,
        [semesterId, programId, semesterNumber, `Semester ${semesterNumber}`]
      );
    }

    // Ensure Class Section exists
    let [secRows] = await pool.execute(
      `SELECT id FROM class_sections 
       WHERE program_id=? AND academic_year_id=? AND year_of_study=? AND semester_id=? AND section_name=? 
       LIMIT 1`,
      [programId, academicYearId, yearOfStudy, semesterId, sectionName]
    );

    let classSectionId = secRows[0]?.id;
    if (!classSectionId) {
      classSectionId = randomUUID();
      await pool.execute(
        `INSERT INTO class_sections (id, program_id, academic_year_id, year_of_study, semester_id, section_name) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [classSectionId, programId, academicYearId, yearOfStudy, semesterId, sectionName]
      );
    }

    // Ensure Class Subject link exists
    let [csRows] = await pool.execute(
      `SELECT id FROM class_subjects 
       WHERE class_section_id=? AND subject_id=? AND academic_year_id=? 
       LIMIT 1`,
      [classSectionId, subjectId, academicYearId]
    );

    let classSubjectId = csRows[0]?.id;
    if (!classSubjectId) {
      classSubjectId = randomUUID();
      await pool.execute(
        `INSERT INTO class_subjects (id, class_section_id, subject_id, academic_year_id) 
         VALUES (?, ?, ?, ?)`,
        [classSubjectId, classSectionId, subjectId, academicYearId]
      );
    }

    return {
      teacherUserId: teachers[0].id,
      classSectionId,
      classSubjectId,
      academicYearId,
      subjectId,
      academicYear: academicYearLabel,
      subjectName: resolvedSubjectName
    };
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

startGrpcService({name:'academic-service',serviceName:'academic',address:process.env.ACADEMIC_GRPC_ADDR||'127.0.0.1:50053',Service:erpProto.AcademicService,handlers});
logger.info('Academic service initialized');
