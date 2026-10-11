import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';

const db = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'erp_user',
  password: process.env.MYSQL_PASSWORD || 'change_me',
  database: process.env.MYSQL_DATABASE || 'college_erp'
});

async function idBy(query, args) {
  const [r] = await db.execute(query, args);
  return r[0]?.id;
}

try {
  const teacherHash = await bcrypt.hash('TeacherPassword123!', 12);
  const studentHash = await bcrypt.hash('StudentPassword123!', 12);

  const cseDeptId = await idBy('SELECT id FROM departments WHERE code = ?', ['CSE']);
  const cseProgId = await idBy('SELECT id FROM programs WHERE code = ?', ['BTECH-CSE']);
  const yearId = await idBy('SELECT id FROM academic_years WHERE label = ?', ['2026–27']);
  const sem3Id = await idBy('SELECT id FROM semesters WHERE program_id = ? AND semester_number = 3', [cseProgId]);

  const [classRows] = await db.execute(
    'SELECT id FROM class_sections WHERE program_id=? AND academic_year_id=? AND semester_id=? AND section_name=? LIMIT 1',
    [cseProgId, yearId, sem3Id, 'A']
  );
  const classSectionId = classRows[0]?.id;

  // 1. Teachers
  const teacherData = [
    { email: 'neha.kulkarni@college.edu', name: 'Prof. Neha Kulkarni', empId: 'FAC-1024', desig: 'Assistant Professor' },
    { email: 'aditya.rao@college.edu', name: 'Dr. Aditya Rao', empId: 'FAC-1031', desig: 'Associate Professor' }
  ];

  const teacherIds = {};
  for (const t of teacherData) {
    let uid = await idBy('SELECT id FROM users WHERE email = ?', [t.email]);
    if (!uid) {
      uid = randomUUID();
      await db.execute(
        `INSERT INTO users (id, email, password_hash, full_name, account_type, is_admin, is_active, must_set_password)
         VALUES (?, ?, ?, ?, 'TEACHER', 0, 1, 0)`,
        [uid, t.email, teacherHash, t.name]
      );
      await db.execute(
        `INSERT INTO faculty_profiles (user_id, employee_id, department_id, designation, office_location)
         VALUES (?, ?, ?, ?, 'Faculty Room 204')`,
        [uid, t.empId, cseDeptId, t.desig]
      );
    }
    teacherIds[t.email] = uid;
  }

  const adminId = await idBy('SELECT id FROM users WHERE is_admin = 1 LIMIT 1');

  // 2. Teaching assignments
  if (classSectionId && adminId) {
    const dsSubjectId = await idBy('SELECT id FROM subjects WHERE program_id=? AND code=?', [cseProgId, 'DS']);
    const dbmsSubjectId = await idBy('SELECT id FROM subjects WHERE program_id=? AND code=?', [cseProgId, 'DBMS']);

    const [csDs] = await db.execute('SELECT id FROM class_subjects WHERE class_section_id=? AND subject_id=?', [classSectionId, dsSubjectId]);
    const [csDbms] = await db.execute('SELECT id FROM class_subjects WHERE class_section_id=? AND subject_id=?', [classSectionId, dbmsSubjectId]);

    if (csDs[0]) {
      const assigned = await idBy('SELECT id FROM teaching_assignments WHERE class_subject_id=?', [csDs[0].id]);
      if (!assigned) {
        await db.execute(
          `INSERT INTO teaching_assignments (id, class_subject_id, teacher_user_id, assigned_by_user_id, status) VALUES (?, ?, ?, ?, 'ACTIVE')`,
          [randomUUID(), csDs[0].id, teacherIds['neha.kulkarni@college.edu'], adminId]
        );
      }
    }

    if (csDbms[0]) {
      const assigned = await idBy('SELECT id FROM teaching_assignments WHERE class_subject_id=?', [csDbms[0].id]);
      if (!assigned) {
        await db.execute(
          `INSERT INTO teaching_assignments (id, class_subject_id, teacher_user_id, assigned_by_user_id, status) VALUES (?, ?, ?, ?, 'ACTIVE')`,
          [randomUUID(), csDbms[0].id, teacherIds['aditya.rao@college.edu'], adminId]
        );
      }
    }
  }

  // 3. Students
  const studentData = [
    { email: 'aarav.shah@college.edu', name: 'Aarav Shah', roll: 'CSE2401' },
    { email: 'diya.patel@college.edu', name: 'Diya Patel', roll: 'CSE2402' },
    { email: 'rohan.mehta@college.edu', name: 'Rohan Mehta', roll: 'CSE2403' },
    { email: 'ananya.desai@college.edu', name: 'Ananya Desai', roll: 'CSE2404' },
    { email: 'kabir.joshi@college.edu', name: 'Kabir Joshi', roll: 'CSE2405' }
  ];

  for (const s of studentData) {
    let sid = await idBy('SELECT id FROM users WHERE email = ?', [s.email]);
    if (!sid) {
      sid = randomUUID();
      await db.execute(
        `INSERT INTO users (id, email, password_hash, full_name, account_type, is_admin, is_active, must_set_password)
         VALUES (?, ?, ?, ?, 'STUDENT', 0, 1, 0)`,
        [sid, s.email, studentHash, s.name]
      );
      await db.execute(
        `INSERT INTO student_profiles (user_id, enrollment_no, department_id, program_id, admission_year, current_year, current_semester, division)
         VALUES (?, ?, ?, ?, 2024, 2, 3, 'A')`,
        [sid, s.roll, cseDeptId, cseProgId]
      );
      if (classSectionId) {
        await db.execute(
          `INSERT INTO enrollments (id, student_user_id, class_section_id, status) VALUES (?, ?, ?, 'ACTIVE')`,
          [randomUUID(), sid, classSectionId]
        );
      }
    }
  }

  console.log('Sample Teacher and Student accounts created successfully!');
  console.log('Admin:   admin@college.edu / AdminPassword123!');
  console.log('Teacher: neha.kulkarni@college.edu / TeacherPassword123!');
  console.log('Student: aarav.shah@college.edu / StudentPassword123!');
} finally {
  await db.end();
}
