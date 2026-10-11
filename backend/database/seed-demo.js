import 'dotenv/config';
import mysql from 'mysql2/promise';

const db=await mysql.createConnection({host:process.env.MYSQL_HOST||'127.0.0.1',port:Number(process.env.MYSQL_PORT||3306),user:process.env.MYSQL_USER||'erp_user',password:process.env.MYSQL_PASSWORD||'change_me',database:process.env.MYSQL_DATABASE||'college_erp'});
const { randomUUID } = await import('node:crypto');
async function idBy(query,args){const [r]=await db.execute(query,args);return r[0]?.id;}
try {
  const departments=[['CSE','Computer Science'],['IT','Information Technology'],['MATH','Mathematics'],['ENTC','Electronics']];
  for(const [code,name] of departments){if(!(await idBy('SELECT id FROM departments WHERE code=?',[code]))) await db.execute('INSERT INTO departments (id,code,name) VALUES (?,?,?)',[randomUUID(),code,name]);}
  const programSeeds=[['BTECH-CSE','B.Tech CSE','CSE'],['BTECH-IT','B.Tech IT','IT'],['BTECH-ENTC','B.Tech Electronics','ENTC']];
  for(const [code,name,dcode] of programSeeds){const did=await idBy('SELECT id FROM departments WHERE code=?',[dcode]);if(!(await idBy('SELECT id FROM programs WHERE code=?',[code]))) await db.execute('INSERT INTO programs (id,department_id,code,name,duration_years) VALUES (?,?,?,?,4)',[randomUUID(),did,code,name]);}
  const yearLabel=process.env.DEMO_ACADEMIC_YEAR||'2026–27';
  let yearId=await idBy('SELECT id FROM academic_years WHERE label=?',[yearLabel]);
  if(!yearId){yearId=randomUUID();await db.execute('INSERT INTO academic_years (id,label,starts_on,ends_on,is_current) VALUES (?,?,?,?,1)',[yearId,yearLabel,'2026-07-01','2027-06-30']);}
  const programs=[]; for(const [code,name] of programSeeds){const id=await idBy('SELECT id FROM programs WHERE code=?',[code]);programs.push({id,code,name});}
  for(const p of programs){
    const semIds={};
    for(let n=1;n<=8;n++){let sid=await idBy('SELECT id FROM semesters WHERE program_id=? AND semester_number=?',[p.id,n]);if(!sid){sid=randomUUID();await db.execute('INSERT INTO semesters (id,program_id,semester_number,label) VALUES (?,?,?,?)',[sid,p.id,n,`Semester ${n}`]);}semIds[n]=sid;}
    for(let year=1;year<=4;year++) for(const sem of [year*2-1,year*2]) for(const division of ['A','B','C']){
      let classId=await idBy('SELECT id FROM class_sections WHERE program_id=? AND academic_year_id=? AND year_of_study=? AND semester_id=? AND section_name=?',[p.id,yearId,year,semIds[sem],division]);
      if(!classId){classId=randomUUID();await db.execute('INSERT INTO class_sections (id,program_id,academic_year_id,year_of_study,semester_id,section_name) VALUES (?,?,?,?,?,?)',[classId,p.id,yearId,year,semIds[sem],division]);}
    }
  }
  const subjectSeeds={
    'BTECH-CSE':[
      ['DS','Data Structures',3],['DAA','Design & Analysis of Algorithms',4],['DBMS','Database Management Systems',3],['OS','Operating Systems',4],['CN','Computer Networks',5],['WT','Web Technology',5],['SE','Software Engineering',6],['MATH3','Engineering Mathematics III',3]
    ],
    'BTECH-IT':[['ITDS','Data Structures',3],['ITDBMS','Database Management Systems',3],['ITOS','Operating Systems',4],['ITCN','Computer Networks',5],['ITWT','Web Technology',5]],
    'BTECH-ENTC':[['ECMATH','Engineering Mathematics III',3],['ECOS','Operating Systems',4]]
  };
  for(const [pcode,seeds] of Object.entries(subjectSeeds)){
    const program=programs.find(p=>p.code===pcode);
    for(const [code,name,semester] of seeds){let sid=await idBy('SELECT id FROM subjects WHERE program_id=? AND code=?',[program.id,code]);if(!sid){sid=randomUUID();await db.execute('INSERT INTO subjects (id,program_id,code,name,credits,is_active) VALUES (?,?,?,?,3,1)',[sid,program.id,code,name]);}
      const semId=await idBy('SELECT id FROM semesters WHERE program_id=? AND semester_number=?',[program.id,semester]);
      const [sections]=await db.execute('SELECT id FROM class_sections WHERE program_id=? AND academic_year_id=? AND semester_id=?',[program.id,yearId,semId]);
      for(const section of sections){if(!(await idBy('SELECT id FROM class_subjects WHERE class_section_id=? AND subject_id=? AND academic_year_id=?',[section.id,sid,yearId]))) await db.execute('INSERT INTO class_subjects (id,class_section_id,subject_id,academic_year_id) VALUES (?,?,?,?)',[randomUUID(),section.id,sid,yearId]);}
    }
  }
  console.log('Master data seeded. No sample students, teachers or passwords were created. Create accounts from the Admin Dashboard.');
} finally { await db.end(); }
