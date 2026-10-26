import 'dotenv/config';
import mysql from 'mysql2/promise';
import { config } from '../src/config/env.js';

const db = await mysql.createConnection(
  config.mysqlUrl
    ? { uri: config.mysqlUrl, ssl: config.mysqlSsl }
    : { host: config.mysqlHost, port: config.mysqlPort, user: config.mysqlUser, password: config.mysqlPassword, database: config.mysqlDatabase, ssl: config.mysqlSsl }
);
const { randomUUID } = await import('node:crypto');
async function idBy(query, args) {
  const [r] = await db.execute(query, args);
  return r[0]?.id;
}

try {
  // 1. Departments
  const departments = [
    ['CSE', 'Computer Science and Engineering'],
    ['CE', 'Computer Engineering'],
    ['EXTC', 'Electronics and Telecommunication Engineering'],
    ['IT', 'Information Technology'],
    ['ASH', 'Applied Sciences and Humanities']
  ];
  for (const [code, name] of departments) {
    if (!(await idBy('SELECT id FROM departments WHERE code=?', [code]))) {
      await db.execute('INSERT INTO departments (id, code, name) VALUES (?, ?, ?)', [randomUUID(), code, name]);
    }
  }

  // 2. Programs
  const programSeeds = [
    ['BTECH-CSE', 'B.Tech Computer Science and Engineering', 'CSE'],
    ['BTECH-CE', 'B.Tech Computer Engineering', 'CE'],
    ['BTECH-EXTC', 'B.Tech Electronics and Telecommunication Engineering', 'EXTC'],
    ['BTECH-IT', 'B.Tech Information Technology', 'IT']
  ];
  for (const [code, name, dcode] of programSeeds) {
    const did = await idBy('SELECT id FROM departments WHERE code=?', [dcode]);
    if (!(await idBy('SELECT id FROM programs WHERE code=?', [code]))) {
      await db.execute('INSERT INTO programs (id, department_id, code, name, duration_years) VALUES (?, ?, ?, ?, 4)', [randomUUID(), did, code, name]);
    }
  }

  // 3. Academic Year
  const yearLabel = process.env.DEMO_ACADEMIC_YEAR || '2026–27';
  let yearId = await idBy('SELECT id FROM academic_years WHERE label=?', [yearLabel]);
  if (!yearId) {
    yearId = randomUUID();
    await db.execute('INSERT INTO academic_years (id, label, starts_on, ends_on, is_current) VALUES (?, ?, ?, ?, 1)', [yearId, yearLabel, '2026-07-01', '2027-06-30']);
  }

  const programs = [];
  for (const [code] of programSeeds) {
    const id = await idBy('SELECT id FROM programs WHERE code=?', [code]);
    if (id) programs.push({ id, code });
  }

  // 4. Semesters (1..8) & Class Sections for all years
  for (const p of programs) {
    const semIds = {};
    for (let n = 1; n <= 8; n++) {
      let sid = await idBy('SELECT id FROM semesters WHERE program_id=? AND semester_number=?', [p.id, n]);
      if (!sid) {
        sid = randomUUID();
        await db.execute('INSERT INTO semesters (id, program_id, semester_number, label) VALUES (?, ?, ?, ?)', [sid, p.id, n, `Semester ${n}`]);
      }
      semIds[n] = sid;
    }

    // Classes: FY (year 1, sems 1 & 2), SY (year 2, sems 3 & 4), TY (year 3, sems 5 & 6), Final Year (year 4, sems 7 & 8)
    for (let year = 1; year <= 4; year++) {
      for (const sem of [year * 2 - 1, year * 2]) {
        for (const division of ['A', 'B']) {
          let classId = await idBy(
            'SELECT id FROM class_sections WHERE program_id=? AND academic_year_id=? AND year_of_study=? AND semester_id=? AND section_name=?',
            [p.id, yearId, year, semIds[sem], division]
          );
          if (!classId) {
            classId = randomUUID();
            await db.execute(
              'INSERT INTO class_sections (id, program_id, academic_year_id, year_of_study, semester_id, section_name) VALUES (?, ?, ?, ?, ?, ?)',
              [classId, p.id, yearId, year, semIds[sem], division]
            );
          }
        }
      }
    }
  }

  // 5. Official Subjects (Semesters 1 to 8) from SPIT Mumbai Curriculum
  const cseSubjects = [
    // Sem 1 (FY)
    ['MA101', 'Engineering Calculus', 1],
    ['EC103', 'Basic Electrical & Electronics Engineering', 1],
    ['AS101', 'Engineering Physics', 1],
    ['AS113', 'Design Thinking / Engineering Exploration', 1],
    ['CECS101', 'Imperative Programming Lab', 1],
    ['AS115', 'Professional Communication', 1],
    // Sem 2 (FY)
    ['MA201', 'Differential Equations and Complex Analysis', 2],
    ['EC203', 'Digital Systems and Microprocessors', 2],
    ['AS208', 'Signals & Systems', 2],
    ['CECS201', 'Object Oriented Programming Lab', 2],
    ['AS215', 'Corporate Communication', 2],
    // Sem 3 (SY)
    ['MA301', 'Linear Algebra', 3],
    ['CECS301', 'Discrete Structures and Graph Theory', 3],
    ['CECS302', 'Database Management Systems', 3],
    ['CECS303', 'Computer Architecture and Organization', 3],
    ['CECS304', 'Data Structures', 3],
    ['CECS306', 'Data Science Lab', 3],
    // Sem 4 (SY)
    ['MA402', 'Probability and Statistics', 4],
    ['CECS402', 'Computer Communications and Networks', 4],
    ['CECS403', 'Operating Systems', 4],
    ['CECS404', 'Software Engineering', 4],
    ['CECS405', 'Design and Analysis of Algorithms', 4],
    ['CECS407', 'Real-life Problem Solving in AI (Capstone Project)', 4],
    ['AS401', 'Constitution of India', 4],
    // Sem 5 (TY)
    ['CECS501', 'Theory of Computation', 5],
    ['CS502', 'Distributed and Cloud Computing', 5],
    ['CS503', 'Soft Computing', 5],
    ['CS504', 'Information and Network Security', 5],
    ['OE515', 'Deep Learning', 5],
    ['CS5PRI', 'Mini Project I', 5],
    // Sem 6 (TY)
    ['CS601', 'Advanced System Design', 6],
    ['CS602', 'Human Machine Interaction', 6],
    ['CS604', 'Applied Machine Learning and Deep Learning', 6],
    ['CS621', 'Natural Language Processing', 6],
    ['CS622', 'Generative AI', 6],
    ['CS631', 'Big Data Analytics', 6],
    ['CS6PRII', 'Mini Project II', 6],
    // Sem 7 (Final Year)
    ['CS713', 'Blockchain Technology', 7],
    ['CS714', 'Quantum Computing', 7],
    ['CS723', 'Agentic AI', 7],
    ['CS724', 'Explainable AI', 7],
    ['CS734', 'MLOps Analytics', 7],
    ['CS7PR', 'Main Project Stage I', 7],
    // Sem 8 (Final Year)
    ['CS813', 'Advanced Blockchain Systems', 8],
    ['CS823', 'Advanced Agentic AI', 8],
    ['CS834', 'MLOps Analytics Stage II', 8],
    ['INT8R', 'Research / Industry Internship', 8],
    ['CS8PR', 'Main Project Stage II', 8]
  ];

  const extcSubjects = [
    // Sem 1 (FY)
    ['MA101', 'Engineering Calculus', 1],
    ['EC102', 'Basic Electrical Engineering', 1],
    ['AS101', 'Engineering Physics', 1],
    ['AS113', 'Design Thinking / Engineering Exploration', 1],
    ['EC105', 'Imperative Programming Lab', 1],
    ['AS115', 'Professional Communication', 1],
    // Sem 2 (FY)
    ['MA201', 'Differential Equations and Complex Analysis', 2],
    ['EC201', 'Digital Systems and Microprocessors', 2],
    ['AS202', 'Industrial Chemistry', 2],
    ['EC202', 'Data Structure Lab', 2],
    ['AS215', 'Corporate Communication', 2],
    // Sem 3 (SY)
    ['MA301', 'Linear Algebra', 3],
    ['EC301', 'Electromagnetic Wave Engineering', 3],
    ['EC302', 'Signal, Network and System', 3],
    ['EC303', 'Electronic Devices and Circuits', 3],
    ['EC304', 'Computer Organization & Architecture', 3],
    ['EC305', 'Hardware Description Language Programming', 3],
    // Sem 4 (SY)
    ['MA401', 'Probability and Stochastic Process', 4],
    ['EC401', 'Digital Communication', 4],
    ['EC402', 'Mixed Signal Integrated Circuit', 4],
    ['EC403', 'Microcontroller', 4],
    ['EC404', 'Control Systems', 4],
    ['EC405', 'Real Life Problem Solving Using AI', 4],
    ['AS401', 'Constitution of India', 4],
    // Sem 5 (TY)
    ['EC501', 'Digital Signal Processing', 5],
    ['EC502', 'Mobile Wireless Communication', 5],
    ['EC503', 'Computer Communication Networks', 5],
    ['EC504', 'Power Electronics', 5],
    ['EC5PRI', 'Mini Project I', 5],
    // Sem 6 (TY)
    ['EC601', 'Radiating Systems', 6],
    ['EC602', 'Basics of VLSI', 6],
    ['EC603', 'Optical Fiber Communication', 6],
    ['EC604', 'Microwave Communication', 6],
    ['EC605', 'Lab Related to Embedded Domain', 6],
    ['EC6PRII', 'Mini Project II', 6],
    // Sem 7 (Final Year)
    ['EC701', 'Space Communication Technologies', 7],
    ['EC702', 'Cyber Security and Digital Forensics', 7],
    ['EC703', 'Wireless Networks', 7],
    ['EC706', 'Embedded Systems', 7],
    ['EC7PR', 'Main Project Stage I', 7],
    // Sem 8 (Final Year)
    ['EC801', 'IoT Protocols & Applications', 8],
    ['EC802', 'Advanced Signal Processing', 8],
    ['EC807', 'Analog CMOS VLSI Design', 8],
    ['INT8R', 'Research / Industry Internship', 8],
    ['EC8PR', 'Final Year Project Stage II', 8]
  ];

  const subjectSeeds = {
    'BTECH-CSE': cseSubjects,
    'BTECH-CE': cseSubjects,
    'BTECH-EXTC': extcSubjects,
    'BTECH-IT': cseSubjects.filter(([,, sem]) => sem <= 5)
  };

  for (const [pcode, seeds] of Object.entries(subjectSeeds)) {
    const program = programs.find(p => p.code === pcode);
    if (!program) continue;
    for (const [code, name, semester] of seeds) {
      let sid = await idBy('SELECT id FROM subjects WHERE program_id=? AND code=?', [program.id, code]);
      if (!sid) {
        sid = randomUUID();
        await db.execute(
          'INSERT INTO subjects (id, program_id, code, name, credits, is_active) VALUES (?, ?, ?, ?, 3, 1)',
          [sid, program.id, code, name]
        );
      }
      const semId = await idBy('SELECT id FROM semesters WHERE program_id=? AND semester_number=?', [program.id, semester]);
      if (semId) {
        const [sections] = await db.execute(
          'SELECT id FROM class_sections WHERE program_id=? AND academic_year_id=? AND semester_id=?',
          [program.id, yearId, semId]
        );
        for (const section of sections) {
          if (!(await idBy('SELECT id FROM class_subjects WHERE class_section_id=? AND subject_id=? AND academic_year_id=?', [section.id, sid, yearId]))) {
            await db.execute(
              'INSERT INTO class_subjects (id, class_section_id, subject_id, academic_year_id) VALUES (?, ?, ?, ?)',
              [randomUUID(), section.id, sid, yearId]
            );
          }
        }
      }
    }
  }

  console.log('SPIT Mumbai master curriculum data (Semesters 1-8, CSE, CE, EXTC) successfully seeded!');
} finally {
  await db.end();
}
