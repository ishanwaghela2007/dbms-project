import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import XLSX from 'xlsx';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { pool, pingDb } from '../shared/db.js';
import { logger } from '../shared/logger.js';
import { config } from '../config/env.js';
import { connectRedis, isRedisReady } from '../shared/redis.js';
import { rpc } from '../shared/grpc.js';
import { clients } from './clients.js';
import { authenticate, requireAdmin, requireUser } from './middleware.js';
import { cloudinaryConfigured, uploadAuthenticatedBuffer, uploadPublicBuffer, deleteAuthenticatedAsset } from './cloudinary.js';

const app = express();
const api = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Math.max(1, config.maxUploadMb) * 1024 * 1024, files: 1 } });

app.disable('x-powered-by');
const tp = config.trustProxy;
app.set('trust proxy', tp === false ? false : (/^\d+$/.test(String(tp)) ? Number(tp) : tp));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedFrontendOrigins = [...new Set([
  ...config.frontendOrigin.split(',').map((origin) => origin.trim()).filter(Boolean),
  config.deployedFrontendOrigin.trim(),
])];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedFrontendOrigins.includes(origin) || origin.endsWith('.onrender.com') || origin.includes('localhost')) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy does not allow access from ${origin}`));
  },
  credentials: true,
  methods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Idempotency-Key']
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use('/api/v1/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use((req,res,next)=>{ req.requestId=randomUUID(); res.setHeader('X-Request-Id',req.requestId); next(); });
app.use((req,res,next)=>{
  if (req.path === '/' || req.path === '/health' || req.path === '/helth' || req.path === '/healthz' || req.path === '/ready') return next();
  if (!config.requireHttps || req.secure) return next();
  const host=req.get('host');
  if (!host) return res.status(400).json({error:'Host header required'});
  return res.redirect(308, `https://${host}${req.originalUrl}`);
});

app.get('/', (_req, res) => res.json({ status: 'ok', service: 'college-erp-api-gateway' }));
app.get('/healthz', (_req, res) => res.status(200).send('OK'));
app.get('/helth', wrap(async(_req,res)=>{
  const db=await pingDb(); res.json({status:db?'ok':'degraded',service:'college-erp-api-gateway',database:db?'ok':'down',redis:isRedisReady()?'ok':'fallback-to-auth-service',timestamp:new Date().toISOString()});
}));

function wrap(fn) { return (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next); }
function payload(req, extras={}) { return { ...(req.body||{}), ...extras, actorUserId:req.auth?.userId }; }
function items(result) { return Array.isArray(result) ? result : (result?.items || []); }
function rpcHttp(client,method,data) { return rpc(client,method,data); }
function statusForGrpc(code) { return ({3:400,4:504,5:404,6:409,7:403,8:429,9:409,14:503,16:401})[code] || 500; }
function formatStudent(row) {
  const currentSem=Number(row.current_semester||0);
  return { id:row.id||row.user_id, rollNo:row.rollNo||row.enrollment_no, name:row.name||row.full_name, email:row.email, department:row.department||row.department_name||row.department_id||'', program:row.program||row.program_name||row.program_id||'', semester:row.semester|| (currentSem?`Semester ${currentSem}`:''), division:row.division||'', attendance:Number(row.attendance??row.attendancePercent??row.attendance_percent??0), attendanceSessions:Number(row.attendanceSessions??row.attendance_sessions??0), status:(row.is_active===false||row.is_active===0)?'Inactive':'Active', avatar:row.avatar_public_id||undefined };
}
function formatTeacher(row) {
  return { id:row.id||row.user_id, employeeId:row.employeeId||row.employee_id, name:row.name||row.full_name, email:row.email, department:row.department||row.department_name||row.department_id||'', designation:row.designation||'', subjects:row.subjects||row.assignments?.map(a=>a.subject_name)||[], status:(row.is_active===false||row.is_active===0)?'Inactive':'Active' };
}
function formatFollowup(row) {
  return {
    id: row.id,
    studentId: row.studentId || row.studentUserId || row.student_user_id,
    studentName: row.studentName || row.student_name || '',
    rollNo: row.rollNo || row.roll_no || '',
    subject: row.subject || row.subjectName || row.subject_name || '',
    attendance: Number(row.attendance ?? row.attendancePercent ?? row.attendance_percent ?? 0),
    teacherName: row.teacherName || row.contact_teacher_name || row.contactTeacherName || 'Assigned teacher',
    status: row.status || 'OPEN',
    contact: row.contact || row.contact_teacher_name || row.contactTeacherName || 'Assigned teacher',
    classSubjectId: row.classSubjectId || row.class_subject_id,
    contactTeacherUserId: row.contactTeacherUserId || row.contact_teacher_user_id,
    reason: row.reason || ''
  };
}
function formatMeeting(row) {
  const start = row.starts_at_utc || row.startsAt || row.starts_at;
  const date = start ? new Date(start).toISOString().slice(0,10) : '';
  const time = start ? new Date(start).toISOString().slice(11,16) : '';
  return { id:row.id, studentId:row.student_user_id||row.studentId, studentName:row.student_name||row.studentName, teacherName:row.teacher_name||row.teacherName, subject:row.subject_name||row.subject||'', date, time, location:row.meeting_location||row.location||'', status:row.status, message:row.student_message||row.teacher_response||row.message||'', startsAt:start, endsAt:row.ends_at_utc };
}
function formatPaper(row) {
  const access = row.status === 'PUBLISHED' ? 'Published' : row.visibility === 'FACULTY_ONLY' ? 'Restricted' : 'Draft';
  const category = ({QUESTION_PAPER:'Question paper',MARKING_SCHEME:'Answer key',ANSWER_KEY:'Answer key',OTHER:'Study material'})[row.paper_type] || 'Question paper';
  return { id:row.id, title:row.title, subject:row.subject_name||row.subject||'', semester:row.semester_id||'', academicYear:row.academic_year_id||'', category, uploadedBy:row.uploaded_by||'', uploadedAt:row.created_at?new Date(row.created_at).toISOString().slice(0,10):'', fileName:row.fileName||row.original_filename||row.title+'.pdf', access };
}
function formatValidationItem(row, maxMarks) {
  const statusMap={MATCH:'match',MISMATCH:'discrepancy',MARKS_NOT_FOUND:'not_found',STUDENT_NOT_MATCHED:'ambiguous',INVALID_RANGE:'invalid',MANUAL_REVIEW:'ambiguous'};
  return { itemId:row.id, studentId:row.studentUserId||row.student_user_id, rollNo:row.rollNumber||row.roll_no||row.identifier_from_pdf||'', studentName:row.studentName||row.student_name||'Unmatched student', enteredMarks:row.enteredMarks!==undefined?(row.enteredMarks===null?'':String(row.enteredMarks)):(row.entered_marks===null?'':String(row.entered_marks)), pdfMarks:row.extractedMarks??row.extracted_marks??null, maxMarks:Number(row.maxMarks??maxMarks), status:statusMap[row.status]||'ambiguous', evidence:row.evidence||row.evidence_text||null, confidence:row.confidence, confirmed:Boolean(row.confirmed), overrideReason:row.overrideReason||row.override_reason||'' };
}
async function getPaperRows(req) { const result=await rpcHttp(clients.paper,'listPapers',payload(req,{status:req.query.status,subjectId:req.query.subjectId})); return items(result).map(formatPaper); }

// H-3 fix: zod schemas validate auth-route inputs before forwarding to gRPC services.
const loginSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  password: z.string().min(1, 'Password is required').max(1024),
});
const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(1024),
  fullName: z.string().min(1).max(180),
  accountType: z.enum(['STUDENT', 'TEACHER', 'ADMIN']).optional(),
  departmentId: z.string().optional(),
  programId: z.string().optional(),
  enrollmentNo: z.string().optional(),
  employeeId: z.string().optional(),
  autoActivate: z.boolean().optional(),
}).passthrough();
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(1024),
});
const resetPasswordSchema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(8).max(1024),
});
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0]?.message || 'Invalid request body', code: 'VALIDATION_ERROR' });
    }
    req.body = result.data;
    next();
  };
}

app.get('/health', wrap(async(_req,res)=>{
  const db=await pingDb(); res.json({status:db?'ok':'degraded',service:'college-erp-api-gateway',database:db?'ok':'down',redis:isRedisReady()?'ok':'fallback-to-auth-service',timestamp:new Date().toISOString()});
}));
app.get('/ready', wrap(async(_req,res)=>{ const db=await pingDb(); if(!db) return res.status(503).json({ready:false}); res.json({ready:true}); }));

// Authentication and authorization claims are verified locally from the signed access token.
api.post('/cookie-consents', rateLimit({windowMs:60*60*1000,limit:30,standardHeaders:true,legacyHeaders:false,message:{error:'Too many cookie preference requests'}}), wrap(async(req,res)=>{
  const decision=req.body?.decision;
  if (decision !== 'ACCEPTED' && decision !== 'REJECTED') return res.status(400).json({error:'decision must be ACCEPTED or REJECTED'});
  const ipAddress=String(req.ip || req.socket.remoteAddress || 'unknown').slice(0,45);
  const userAgent=String(req.get('user-agent') || '').slice(0,1024) || null;
  const requestedPath=String(req.body?.requestedPath || '').slice(0,255) || null;
  await pool.execute('INSERT INTO cookie_consent_logs (id,decision,ip_address,user_agent,requested_path,request_id) VALUES (?,?,?,?,?,?)',[randomUUID(),decision,ipAddress,userAgent,requestedPath,req.requestId]);
  // H-4 fix: cleanup runs async/fire-and-forget — no longer blocks the response and no longer
  // performs a full table scan on every single POST request.
  setImmediate(() => {
    pool.execute('DELETE FROM cookie_consent_logs WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)',[config.cookieConsentRetentionDays])
      .catch(err => logger.warn({ err: err.message }, 'Cookie consent log cleanup failed'));
  });
  res.status(201).json({recorded:true});
}));
api.post('/auth/login', rateLimit({windowMs:15*60*1000,limit:120,standardHeaders:true,legacyHeaders:false,message:{error:'Too many login attempts. Please wait a few minutes.'}}), validate(loginSchema), wrap(async(req,res)=>res.json(await rpcHttp(clients.auth,'login',req.body||{}))));
api.post('/auth/register', authenticate, requireAdmin, validate(registerSchema), wrap(async(req,res)=>res.status(201).json(await rpcHttp(clients.auth,'register',{...req.body,actorUserId:req.auth.userId}))));
api.post('/auth/verify-email', rateLimit({windowMs:15*60*1000,limit:60,standardHeaders:true,legacyHeaders:false}), wrap(async(req,res)=>res.json(await rpcHttp(clients.auth,'verifyEmail',req.body||{}))));
api.post('/auth/resend-verification', rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:true,legacyHeaders:false}), wrap(async(req,res)=>res.json(await rpcHttp(clients.auth,'resendVerification',req.body||{}))));
api.post('/auth/accept-invitation', rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:true,legacyHeaders:false}), wrap(async(req,res)=>res.json(await rpcHttp(clients.auth,'acceptInvitation',req.body||{}))));
api.get('/auth/me', authenticate, requireUser([]), wrap(async(req,res)=>res.json({id:req.user.id,email:req.user.email,name:req.user.fullName,accountType:req.user.accountType,is_admin:req.user.is_admin,is_active:req.user.is_active,avatar_public_id:req.user.avatar_public_id||undefined})));
api.post('/auth/forgot-password', rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:true,legacyHeaders:false}), wrap(async(req,res)=>res.json(await rpcHttp(clients.auth,'forgotPassword',req.body||{}))));
api.post('/auth/reset-password', rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:true,legacyHeaders:false}), validate(resetPasswordSchema), wrap(async(req,res)=>res.json(await rpcHttp(clients.auth,'resetPassword',req.body||{}))));
api.patch('/auth/change-password', authenticate, requireUser([]), validate(changePasswordSchema), wrap(async(req,res)=>res.json(await rpcHttp(clients.auth,'changePassword',{actorUserId:req.auth.userId,...req.body}))));
api.get('/profile/me', authenticate, requireUser([]), wrap(async(req,res)=>res.json(await rpcHttp(clients.profile,'getMyProfile',{actorUserId:req.auth.userId}))));
api.patch('/profile/me', authenticate, requireUser([]), wrap(async(req,res)=>res.json(await rpcHttp(clients.profile,'updateMyProfile',{actorUserId:req.auth.userId,...req.body}))));
api.get('/teacher/profile', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>res.json(await rpcHttp(clients.profile,'getTeacher',{actorUserId:req.auth.userId,teacherId:req.auth.userId}))));


// Admin dashboard and account management.
api.get('/admin/dashboard', authenticate, requireAdmin, wrap(async(req,res)=>{
  const actorUserId=req.auth.userId;
  const [students,teachers,departments,assignments,low]=await Promise.all([
    rpcHttp(clients.profile,'listStudents',{actorUserId,page:1,pageSize:1}),
    rpcHttp(clients.profile,'listTeachers',{actorUserId,page:1,pageSize:1}),
    rpcHttp(clients.academic,'listDepartments',{actorUserId}),
    rpcHttp(clients.academic,'listTeachingAssignments',{actorUserId}),
    rpcHttp(clients.attendance,'getLowAttendance',{actorUserId}),
  ]);
  res.json({totalStudents:students.total||0,facultyMembers:teachers.total||0,activeCourses:items(assignments).length,attendanceAlerts:items(low).length,departments:items(departments).length,studentGrowthPercent:0,facultyGrowthPercent:0});
}));
api.post('/admin/users', authenticate, requireAdmin, wrap(async(req,res)=>{
  if((req.body?.accountType||'ADMIN')!=='ADMIN') return res.status(400).json({error:'Use /admin/students or /admin/teachers to provision profile accounts'});
  res.status(201).json(await rpcHttp(clients.auth,'createUser',{...req.body,actorUserId:req.auth.userId,accountType:'ADMIN',isAdmin:true}));
}));
api.patch('/admin/users/:id/status', authenticate, requireAdmin, wrap(async(req,res)=>res.json(await rpcHttp(clients.auth,'updateUserStatus',{actorUserId:req.auth.userId,userId:req.params.id,isActive:req.body.isActive,isAdmin:req.body.isAdmin}))));
api.get('/admin/students', authenticate, requireAdmin, wrap(async(req,res)=>{
  const r=await rpcHttp(clients.profile,'listStudents',{actorUserId:req.auth.userId,search:req.query.search||'',departmentId:req.query.departmentId,page:req.query.page||1,pageSize:req.query.pageSize||100});
  res.json(items(r).map(formatStudent));
}));
api.post('/admin/students', authenticate, requireAdmin, wrap(async(req,res)=>{
  const b=req.body||{};
  const refs=await rpcHttp(clients.academic,'resolveAcademicRefs',{departmentName:b.program ? undefined : (b.departmentId||b.department),programName:b.programId||b.program});
  if(!refs.programId||!refs.departmentId) return res.status(400).json({error:'Could not resolve department/program. Configure academic master data first.'});
  const semesterMatch=String(b.currentSemester||b.semester||'').match(/(\d+)/); const semester=Number(semesterMatch?.[1]||3);
  const created=await rpcHttp(clients.profile,'createStudent',{actorUserId:req.auth.userId,fullName:b.fullName||b.name,email:b.email,password:b.password,enrollmentNo:b.enrollmentNo||b.rollNo,departmentId:refs.departmentId,programId:refs.programId,admissionYear:b.admissionYear||new Date().getFullYear(),currentYear:Number(b.currentYear||Math.ceil(semester/2)),currentSemester:semester,division:b.division||'A',phone:b.phone,dateOfBirth:b.dateOfBirth,address:b.address});
  let enrollment={enrolled:false,warning:'Class enrollment not attempted'};
  try { enrollment=await rpcHttp(clients.academic,'autoEnrollStudent',{actorUserId:req.auth.userId,studentUserId:created.id}); } catch(error) { logger.warn({err:error.message,studentId:created.id},'Student created, automatic enrollment failed'); }
  res.status(201).json({...formatStudent({...created,full_name:created.fullName,enrollment_no:created.enrollmentNo,department_name:refs.departmentName,program_name:refs.programName,current_semester:semester,division:b.division||'A'}),invitation:created.inviteUrl?{setupUrl:created.inviteUrl,token:created.inviteToken}:undefined,enrollment});
}));
api.get('/admin/students/:id', authenticate, requireAdmin, wrap(async(req,res)=>res.json(formatStudent(await rpcHttp(clients.profile,'getStudent',{actorUserId:req.auth.userId,studentId:req.params.id})))));
api.patch('/admin/students/:id', authenticate, requireAdmin, wrap(async(req,res)=>res.json(formatStudent(await rpcHttp(clients.profile,'updateStudent',{...req.body,actorUserId:req.auth.userId,studentId:req.params.id})))));
api.get('/admin/teachers', authenticate, requireAdmin, wrap(async(req,res)=>{
  const r=await rpcHttp(clients.profile,'listTeachers',{actorUserId:req.auth.userId,search:req.query.search||'',departmentId:req.query.departmentId,page:req.query.page||1,pageSize:req.query.pageSize||100}); res.json(items(r).map(formatTeacher));
}));
api.post('/admin/teachers', authenticate, requireAdmin, wrap(async(req,res)=>{
  const b=req.body||{}; const refs=await rpcHttp(clients.academic,'resolveAcademicRefs',{departmentName:b.departmentId||b.department}); if(!refs.departmentId) return res.status(400).json({error:'Department not found'});
  const created=await rpcHttp(clients.profile,'createTeacher',{actorUserId:req.auth.userId,fullName:b.fullName||b.name,email:b.email,password:b.password,employeeId:b.employeeId,departmentId:refs.departmentId,designation:b.designation||'Lecturer',qualification:b.qualification,specialization:b.specialization,joiningDate:b.joiningDate,phone:b.phone,officeLocation:b.officeLocation});
  res.status(201).json({...formatTeacher({...created,full_name:created.fullName,employee_id:created.employeeId,department_name:refs.departmentName}),invitation:created.inviteUrl?{setupUrl:created.inviteUrl,token:created.inviteToken}:undefined});
}));
api.get('/admin/teachers/:id', authenticate, requireAdmin, wrap(async(req,res)=>res.json(formatTeacher(await rpcHttp(clients.profile,'getTeacher',{actorUserId:req.auth.userId,teacherId:req.params.id})))));
api.patch('/admin/teachers/:id', authenticate, requireAdmin, wrap(async(req,res)=>res.json(formatTeacher(await rpcHttp(clients.profile,'updateTeacher',{...req.body,actorUserId:req.auth.userId,teacherId:req.params.id})))));

// Admin academic master data and teaching allocations.
api.get('/admin/departments', authenticate, requireAdmin, wrap(async(req,res)=>res.json(items(await rpcHttp(clients.academic,'listDepartments',{actorUserId:req.auth.userId})))));
api.post('/admin/departments', authenticate, requireAdmin, wrap(async(req,res)=>res.status(201).json(await rpcHttp(clients.academic,'createDepartment',{...req.body,actorUserId:req.auth.userId}))));
api.post('/admin/programs', authenticate, requireAdmin, wrap(async(req,res)=>res.status(201).json(await rpcHttp(clients.academic,'createProgram',{...req.body,actorUserId:req.auth.userId}))));
api.post('/admin/academic-years', authenticate, requireAdmin, wrap(async(req,res)=>res.status(201).json(await rpcHttp(clients.academic,'createAcademicYear',{...req.body,actorUserId:req.auth.userId}))));
api.post('/admin/semesters', authenticate, requireAdmin, wrap(async(req,res)=>res.status(201).json(await rpcHttp(clients.academic,'createSemester',{...req.body,actorUserId:req.auth.userId}))));
api.post('/admin/classes', authenticate, requireAdmin, wrap(async(req,res)=>res.status(201).json(await rpcHttp(clients.academic,'createClassSection',{...req.body,actorUserId:req.auth.userId}))));
api.post('/admin/subjects', authenticate, requireAdmin, wrap(async(req,res)=>res.status(201).json(await rpcHttp(clients.academic,'createSubject',{...req.body,actorUserId:req.auth.userId}))));
api.post('/admin/class-subjects', authenticate, requireAdmin, wrap(async(req,res)=>res.status(201).json(await rpcHttp(clients.academic,'createClassSubject',{...req.body,actorUserId:req.auth.userId}))));
api.post('/admin/enrollments', authenticate, requireAdmin, wrap(async(req,res)=>res.status(201).json(await rpcHttp(clients.academic,'enrollStudent',{...req.body,actorUserId:req.auth.userId}))));
api.get('/admin/classes', authenticate, requireAdmin, wrap(async(req,res)=>res.json(items(await rpcHttp(clients.academic,'listClasses',{actorUserId:req.auth.userId})))));
api.get('/admin/subjects', authenticate, requireAdmin, wrap(async(req,res)=>res.json(items(await rpcHttp(clients.academic,'listSubjects',{actorUserId:req.auth.userId})))));
api.get('/admin/teaching-assignments', authenticate, requireAdmin, wrap(async(req,res)=>{
  const r=await rpcHttp(clients.academic,'listTeachingAssignments',{actorUserId:req.auth.userId,teacherUserId:req.query.teacherUserId});
  res.json(items(r).map(x=>({id:x.id,teacher:x.teacher_name,teacherId:x.teacher_user_id,subject:x.subject_name,subjectId:x.subject_id,className:`${({1:'FY',2:'SY',3:'TY',4:'Final Year'})[x.year_of_study]||`Year ${x.year_of_study}`} ${x.program_name||''} · ${x.section_name}`,classId:x.class_section_id,classSubjectId:x.class_subject_id,semester:`Semester ${x.semester_number}`,year:x.academic_year,status:x.status==='ACTIVE'?'Active':'Ended'})));
}));
api.post('/admin/teaching-assignments', authenticate, requireAdmin, wrap(async(req,res)=>{
  const b=req.body||{}; let resolved=b;
  if(!b.teacherUserId||!b.classSubjectId){resolved=await rpcHttp(clients.academic,'resolveTeachingAssignment',{actorUserId:req.auth.userId,teacherName:b.teacher||b.teacherName,subjectName:b.subject||b.subjectName,className:b.className,semester:b.semester,year:b.year});}
  res.status(201).json(await rpcHttp(clients.academic,'createTeachingAssignment',{actorUserId:req.auth.userId,teacherUserId:resolved.teacherUserId||b.teacherUserId,classSubjectId:resolved.classSubjectId||b.classSubjectId}));
}));

// Teacher workspace.
api.get('/teacher/dashboard', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>{
  const actorUserId=req.auth.userId;
  const [classes,assessments,low]=await Promise.all([rpcHttp(clients.academic,'listClasses',{actorUserId}),rpcHttp(clients.marks,'listAssessments',{actorUserId}),rpcHttp(clients.attendance,'getLowAttendance',{actorUserId})]);
  const classRows=items(classes); const assessmentRows=items(assessments); const lowRows=items(low);
  // M-4 fix: sum students across ALL assigned classes, not just the first one.
  let studentTotal = 0;
  if (classRows.length) {
    const rosterCounts = await Promise.all(
      classRows.map(c => rpcHttp(clients.academic,'getClassRoster',{actorUserId,classSubjectId:c.class_subject_id})
        .then(r => Number(r.items?.length || 0))
        .catch(() => 0)
      )
    );
    studentTotal = rosterCounts.reduce((sum, n) => sum + n, 0);
  }
  res.json({assignedSubjects:classRows.length,studentsAcrossClasses:studentTotal,marksToFinalize:assessmentRows.filter(a=>a.status!=='PUBLISHED').length,lowAttendanceFlags:lowRows.length});
}));
api.get('/teacher/classes', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>{
  const r=await rpcHttp(clients.academic,'listClasses',{actorUserId:req.auth.userId});
  res.json(items(r).map(x=>({id:x.class_subject_id,classId:x.class_section_id,subjectId:x.subject_id,classSubjectId:x.class_subject_id,className:`${({1:'FY',2:'SY',3:'TY',4:'Final Year'})[x.year_of_study]||`Year ${x.year_of_study}`} ${x.program_name} · ${x.section_name}`,subject:x.subject_name,semester:`Semester ${x.semester_number}`,academicYear:x.academic_year,sectionName:x.section_name,yearOfStudy:x.year_of_study})));
}));
api.get('/teacher/classes/:classId/subjects/:subjectId/students', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>{
  const r=await rpcHttp(clients.academic,'getClassRoster',{actorUserId:req.auth.userId,classSectionId:req.params.classId,subjectId:req.params.subjectId});
  res.json(items(r).map(x=>({id:x.student_user_id,rollNo:x.roll_no,name:x.full_name,email:x.email,department:'',program:'',semester:'',division:'',attendance:0,status:'Active'})));
}));
api.post('/teacher/assessments', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>res.status(201).json(await rpcHttp(clients.marks,'createAssessment',payload(req)))));
api.get('/teacher/assessments', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>res.json(items(await rpcHttp(clients.marks,'listAssessments',{actorUserId:req.auth.userId,classSubjectId:req.query.classSubjectId})))));
api.get('/teacher/marks/current', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>{
  let assessmentId=req.query.assessmentId;
  if(!assessmentId){const list=await rpcHttp(clients.marks,'listAssessments',{actorUserId:req.auth.userId}); assessmentId=items(list)[0]?.id;}
  if(!assessmentId) return res.json([]);
  const r=await rpcHttp(clients.marks,'getAssessmentMarks',{actorUserId:req.auth.userId,assessmentId});
  res.json(items(r).map(x=>({studentId:x.studentId,rollNo:x.rollNo,studentName:x.studentName,enteredMarks:x.enteredMarks===null?'':String(x.enteredMarks),pdfMarks:null,maxMarks:Number(x.maxMarks),status:'not_found',confirmed:false,overrideReason:''})));
}));
api.post('/teacher/assessments/:assessmentId/marks/bulk', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>res.json(await rpcHttp(clients.marks,'enterBulkMarks',{...req.body,actorUserId:req.auth.userId,assessmentId:req.params.assessmentId}))));
api.put('/teacher/assessments/:assessmentId/marks', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>res.json(await rpcHttp(clients.marks,'updateMark',{...req.body,actorUserId:req.auth.userId,assessmentId:req.params.assessmentId}))));
api.delete('/teacher/marks/:markId', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>res.json(await rpcHttp(clients.marks,'deleteMark',{actorUserId:req.auth.userId,markId:req.params.markId}))));
// M-5 + L-3 fix: rate-limit PDF upload and OCR preview endpoints to prevent DoS via PDF bombs.
const pdfUploadLimit = rateLimit({windowMs:60*1000,limit:10,standardHeaders:true,legacyHeaders:false,message:{error:'Too many PDF uploads. Please wait before uploading again.'}});
api.post('/teacher/marks/pdf-validation/preview', authenticate, requireUser(['TEACHER']), pdfUploadLimit, upload.single('file'), wrap(async(req,res)=>{
  if(!req.file) return res.status(400).json({error:'PDF file is required'});
  if(req.file.mimetype!=='application/pdf'&&!req.file.originalname.toLowerCase().endsWith('.pdf')) return res.status(400).json({error:'Only PDF files are supported'});
  if(req.file.buffer.subarray(0,5).toString()!=='%PDF-') return res.status(400).json({error:'The uploaded file does not have a valid PDF signature'});
  if(req.file.size>config.marksPdfMaxMb*1024*1024) return res.status(413).json({error:`PDF exceeds ${config.marksPdfMaxMb} MB limit`});
  let enteredRows=[]; if(req.body.enteredRows){try{enteredRows=JSON.parse(req.body.enteredRows);}catch{return res.status(400).json({error:'enteredRows must be valid JSON'});}}
  let uploaded=null;
  try {
    if(cloudinaryConfigured()) uploaded=await uploadAuthenticatedBuffer(req.file,process.env.CLOUDINARY_MARKS_FOLDER||'college-erp/marks-validation','image');
    const result=await rpcHttp(clients.marks,'queueMarksPdfValidation',{actorUserId:req.auth.userId,assessmentId:req.body.assessmentId,fileName:req.file.originalname,pdfBase64:req.file.buffer.toString('base64'),pdfPublicId:uploaded?.public_id,enteredRows});
    res.status(202).json({jobId:result.jobId,status:result.status,message:'PDF validation has been queued. This page will update when matching is complete.'});
  } catch(error) { if(uploaded?.public_id) await deleteAuthenticatedAsset(uploaded.public_id,'image').catch(()=>{}); throw error; }
}));
api.get('/teacher/marks/pdf-validation/:jobId', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>{
  const result=await rpcHttp(clients.marks,'getMarkValidation',{actorUserId:req.auth.userId,jobId:req.params.jobId});
  const assessmentRows=items(await rpcHttp(clients.marks,'getAssessmentMarks',{actorUserId:req.auth.userId,assessmentId:result.job.assessment_id}));
  const maxMarks=Number(assessmentRows[0]?.maxMarks||0);
  res.json({job:result.job,rows:result.items.map(x=>formatValidationItem(x,maxMarks)),message:result.job.status==='NEEDS_REVIEW'?'PDF extraction finished. Review every row before saving.':result.job.error_message||null});
}));
api.post('/teacher/marks/pdf-validation/confirm', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>{
  const b=req.body||{}; let jobId=b.jobId; let validation;
  if(jobId) validation=await rpcHttp(clients.marks,'getMarkValidation',{actorUserId:req.auth.userId,jobId});
  else validation=await rpcHttp(clients.marks,'getMarkValidation',{actorUserId:req.auth.userId,assessmentId:b.assessmentId});
  const rows=b.rows||[]; const rowByStudent=new Map(rows.map(r=>[String(r.studentId),r]));
  const decisions=validation.items.map(item=>{
    const row=rowByStudent.get(String(item.student_user_id))||rows.find(r=>String(r.rollNo||'')===String(item.roll_no||item.identifier_from_pdf||''));
    if(!row) return {itemId:item.id,studentUserId:item.student_user_id,confirmed:false};
    return {itemId:item.id,studentUserId:row.studentId||item.student_user_id,finalMarks:Number(row.marksObtained??row.enteredMarks),overrideReason:row.overrideReason||'',confirmed:row.confirmed===true};
  });
  const result=await rpcHttp(clients.marks,'confirmValidatedMarks',{actorUserId:req.auth.userId,jobId:validation.job.id,decisions});
  res.json({ok:true,message:`${result.saved} confirmed marks saved to MySQL.`,jobId:result.jobId,saved:result.saved});
}));
api.post('/teacher/assessments/:assessmentId/publish', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>res.json(await rpcHttp(clients.marks,'publishResults',{actorUserId:req.auth.userId,assessmentId:req.params.assessmentId}))));

// Attendance: manual and spreadsheet commits converge on the same register method.
api.post('/teacher/attendance/sessions', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>res.status(201).json(await rpcHttp(clients.attendance,'saveAttendanceRegister',{...req.body,actorUserId:req.auth.userId}))));
api.post('/teacher/attendance/import/preview', authenticate, requireUser(['TEACHER']), upload.single('file'), wrap(async(req,res)=>{
  if(!req.file) return res.status(400).json({error:'Excel/CSV file is required'});
  const name=req.file.originalname.toLowerCase(); if(!name.endsWith('.xlsx')&&!name.endsWith('.xls')&&!name.endsWith('.csv')) return res.status(400).json({error:'Only XLSX, XLS or CSV imports are accepted'});
  const workbook=XLSX.read(req.file.buffer,{type:'buffer',cellDates:false}); const sheet=workbook.Sheets[workbook.SheetNames[0]]; if(!sheet) return res.status(400).json({error:'Workbook has no worksheet'});
  const rows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});
  const result=await rpcHttp(clients.attendance,'previewAttendanceImport',{actorUserId:req.auth.userId,classSubjectId:req.body.classSubjectId,sessionDate:req.body.sessionDate,lectureNo:Number(req.body.lectureNo||1),rows}); res.json(result);
}));
api.post('/teacher/attendance/import/:jobId/commit', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>res.json(await rpcHttp(clients.attendance,'commitAttendanceImport',{actorUserId:req.auth.userId,jobId:req.params.jobId}))));
api.patch('/teacher/attendance/sessions/:id/finalize', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>res.json(await rpcHttp(clients.attendance,'finalizeAttendanceSession',{actorUserId:req.auth.userId,sessionId:req.params.id}))));
api.get('/teacher/attendance/low', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>{
  const [low,follow] = await Promise.all([rpcHttp(clients.attendance,'getLowAttendance',{actorUserId:req.auth.userId,classSubjectId:req.query.classSubjectId}),rpcHttp(clients.attendance,'listFollowups',{actorUserId:req.auth.userId})]);
  const followItems=items(follow);
  res.json(items(low).map(x=>{const f=followItems.find(f=>f.student_user_id===x.studentUserId&&f.class_subject_id===x.classSubjectId);return {id:f?.id||`untracked:${x.studentUserId}:${x.classSubjectId}`,studentId:x.studentUserId,studentName:x.studentName,rollNo:x.rollNo,subject:x.subjectName,attendance:Number(x.attendancePercent),teacherName:f?.contact_teacher_name||req.user.fullName||'Assigned teacher',status:f?.status||'OPEN',contact:f?.contact_teacher_name||req.user.fullName||'Assigned teacher',classSubjectId:x.classSubjectId};}));
}));
api.post('/teacher/students/:studentId/attendance-followups', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>{
  const b=req.body||{};
  const classSubjectId=typeof b.classSubjectId==='string'&&/^[0-9a-f-]{36}$/i.test(b.classSubjectId)?b.classSubjectId:undefined;
  const subjectName=b.subjectName||b.subject||(typeof b.classSubjectId==='string'&&!classSubjectId?b.classSubjectId:undefined);
  const r=await rpcHttp(clients.attendance,'createFollowup',{...b,actorUserId:req.auth.userId,studentUserId:req.params.studentId,classSubjectId,subjectName});
  res.status(201).json({ok:true,message:'Low-attendance follow-up created and notification queued.',...formatFollowup(r),contactTeacherUserId:r.contactTeacherUserId});
}));
api.get('/teacher/followups', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>res.json(items(await rpcHttp(clients.attendance,'listFollowups',{actorUserId:req.auth.userId})).map(formatFollowup))));
api.post('/teacher/availability-slots', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>res.status(201).json(await rpcHttp(clients.attendance,'publishAvailability',{...req.body,actorUserId:req.auth.userId}))));
api.get('/teacher/meetings', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>res.json(items(await rpcHttp(clients.attendance,'listMeetings',{actorUserId:req.auth.userId,status:req.query.status||'ALL'})).map(formatMeeting))));
api.patch('/teacher/meetings/:id/respond', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>res.json(await rpcHttp(clients.attendance,'respondToMeeting',{...req.body,actorUserId:req.auth.userId,appointmentId:req.params.id}))));
api.patch('/teacher/meetings/:id/complete', authenticate, requireUser(['TEACHER']), wrap(async(req,res)=>{
  res.json(await rpcHttp(clients.attendance,'respondToMeeting',{actorUserId:req.auth.userId,appointmentId:req.params.id,action:'COMPLETE'}));
}));

// Student workspace.
api.get('/student/dashboard', authenticate, requireUser(['STUDENT']), wrap(async(req,res)=>{
  const actorUserId=req.auth.userId;
  const [attendance,results,notifications]=await Promise.all([rpcHttp(clients.attendance,'getStudentAttendanceSummary',{actorUserId}),rpcHttp(clients.marks,'getStudentResults',{actorUserId}),rpcHttp(clients.notification,'listNotifications',{actorUserId,limit:10})]);
  const resultRows=items(results); const subjects=attendance.subjects||[];
  const averageScore=resultRows.length?Number((resultRows.reduce((s,r)=>s+(Number(r.marks_obtained)/Number(r.max_marks))*100,0)/resultRows.length).toFixed(1)):0;
  res.json({currentAttendance:attendance.currentAttendance??0,averageScore,activeSubjects:attendance.activeSubjects||0,subjects:subjects.map(s=>({name:s.subjectName,code:s.subjectCode,score:0,max:100,attendance:Number(s.attendancePercent||0)})),recentResults:resultRows.slice(0,5).map(r=>({id:r.assessment_id,subject:r.subject_name,code:r.subject_code,assessment:r.assessment_name,obtained:Number(r.marks_obtained),max:Number(r.max_marks),status:'Published'})),unreadNotifications:notifications.unreadCount||0});
}));
api.get('/student/profile', authenticate, requireUser(['STUDENT']), wrap(async(req,res)=>res.json(formatStudent(await rpcHttp(clients.profile,'getStudent',{actorUserId:req.auth.userId,studentId:req.auth.userId})))));
api.get('/student/results', authenticate, requireUser(['STUDENT']), wrap(async(req,res)=>{
  const r=await rpcHttp(clients.marks,'getStudentResults',{actorUserId:req.auth.userId}); res.json(items(r).map(x=>({id:x.assessment_id,subject:x.subject_name,code:x.subject_code,assessment:x.assessment_name,obtained:Number(x.marks_obtained),max:Number(x.max_marks),status:'Published'})));
}));
api.get('/student/attendance', authenticate, requireUser(['STUDENT']), wrap(async(req,res)=>res.json(await rpcHttp(clients.attendance,'getStudentAttendanceSummary',{actorUserId:req.auth.userId}))));
api.get('/student/attendance-followups', authenticate, requireUser(['STUDENT']), wrap(async(req,res)=>res.json(items(await rpcHttp(clients.attendance,'listFollowups',{actorUserId:req.auth.userId})).map(formatFollowup))));
api.get('/student/attendance-followups/:followupId/available-slots', authenticate, requireUser(['STUDENT']), wrap(async(req,res)=>res.json(items(await rpcHttp(clients.attendance,'listAvailableSlots',{actorUserId:req.auth.userId,followupId:req.params.followupId})).map(s=>({id:s.id,teacherUserId:s.teacher_user_id,startsAt:s.starts_at_utc,endsAt:s.ends_at_utc})))));
api.post('/student/attendance-followups/:followupId/meeting-requests', authenticate, requireUser(['STUDENT']), wrap(async(req,res)=>{
  const r=await rpcHttp(clients.attendance,'requestMeeting',{...req.body,actorUserId:req.auth.userId,followupId:req.params.followupId,idempotencyKey:req.get('Idempotency-Key')||req.body.idempotencyKey}); res.status(201).json({ok:true,message:'Meeting request submitted. It is pending teacher approval.',meeting:formatMeeting(r)});
}));
api.get('/student/meetings', authenticate, requireUser(['STUDENT']), wrap(async(req,res)=>res.json(items(await rpcHttp(clients.attendance,'listMeetings',{actorUserId:req.auth.userId,status:'ALL'})).map(formatMeeting))));
api.patch('/student/meetings/:id/cancel', authenticate, requireUser(['STUDENT']), wrap(async(req,res)=>res.json(await rpcHttp(clients.attendance,'cancelMeeting',{...req.body,actorUserId:req.auth.userId,appointmentId:req.params.id}))));
api.post('/student/meetings/:id/accept-proposal', authenticate, requireUser(['STUDENT']), wrap(async(req,res)=>res.json(await rpcHttp(clients.attendance,'respondToMeeting',{actorUserId:req.auth.userId,appointmentId:req.params.id,action:'ACCEPT_PROPOSAL'}))));
api.get('/student/notifications', authenticate, requireUser(['STUDENT']), wrap(async(req,res)=>{
  const r=await rpcHttp(clients.notification,'listNotifications',{actorUserId:req.auth.userId,limit:req.query.limit||50});
  res.json(items(r).map(n=>({id:n.id,title:n.title,message:n.message,kind:String(n.type||'general').toLowerCase().includes('attendance')?'attendance':String(n.type||'').toLowerCase().includes('meeting')?'meeting':'general',createdAt:n.createdAt||n.created_at,isRead:Boolean(n.isRead??n.is_read),followupId:n.relatedEntityType==='ATTENDANCE_FOLLOWUP'?n.relatedEntityId:undefined})));
}));
api.patch('/student/notifications/:id/read', authenticate, requireUser(['STUDENT']), wrap(async(req,res)=>res.json(await rpcHttp(clients.notification,'markNotificationRead',{actorUserId:req.auth.userId,notificationId:req.params.id}))));

// L-3 fix: rate-limit paper uploads as well.
api.get('/papers', authenticate, requireUser([]), wrap(async(req,res)=>res.json(await getPaperRows(req))));
api.post('/papers', authenticate, requireUser(['TEACHER']), pdfUploadLimit, upload.single('file'), wrap(async(req,res)=>{
  if(!req.file) return res.status(400).json({ok:false,message:'PDF file is required'});
  if(req.file.mimetype!=='application/pdf'&&!req.file.originalname.toLowerCase().endsWith('.pdf')) return res.status(400).json({ok:false,message:'Only PDF files are accepted'});
  if(req.file.buffer.subarray(0,5).toString()!=='%PDF-') return res.status(400).json({ok:false,message:'The uploaded file does not have a valid PDF signature'});
  if(!cloudinaryConfigured()) return res.status(503).json({ok:false,message:'Cloudinary is not configured on the backend'});
  let uploaded;
  try {
    uploaded=await uploadAuthenticatedBuffer(req.file,process.env.CLOUDINARY_PAPERS_FOLDER||'college-erp/papers','image');
    const b=req.body||{}; const paperType=({'Question paper':'QUESTION_PAPER','Answer key':'ANSWER_KEY','Study material':'OTHER'})[b.category]||b.paperType||'QUESTION_PAPER';
    let subjectId=b.subjectId; let classSubjectId=b.classSubjectId;
    if(!subjectId&&b.subject){
      const offerings=items(await rpcHttp(clients.academic,'listClasses',{actorUserId:req.auth.userId}));
      const match=offerings.find(x=>String(x.subject_name).toLowerCase()===String(b.subject).toLowerCase());
      if(match){subjectId=match.subject_id;classSubjectId=classSubjectId||match.class_subject_id;}
    }
    if(!subjectId) throw Object.assign(new Error('Subject not found. Create a subject offering and teaching assignment first or pass subjectId.'),{status:400});
    const access=b.access||'Draft'; const visibility=access==='Restricted'?'FACULTY_ONLY':'ENROLLED_STUDENTS';
    const paper=await rpcHttp(clients.paper,'createPaper',{actorUserId:req.auth.userId,cloudinaryPublicId:uploaded.public_id,subjectId,classSubjectId,title:b.title||req.file.originalname.replace(/\.pdf$/i,''),originalFilename:req.file.originalname,mimeType:'application/pdf',bytesSize:req.file.size,paperType,visibility,status:access==='Published'?'PUBLISHED':'DRAFT',academicYearId:b.academicYearId||null,semesterId:b.semesterId||null});
    res.status(201).json({ok:true,message:'PDF uploaded securely.',paper:formatPaper({...paper,...b,id:paper.id,subject:b.subject,subject_name:b.subject,original_filename:req.file.originalname,paper_type:paperType,status:paper.status,visibility})});
  } catch(error) { if(uploaded?.public_id) await deleteAuthenticatedAsset(uploaded.public_id,'image').catch(()=>{}); throw error; }
}));
api.get('/papers/:id/access', authenticate, requireUser([]), wrap(async(req,res)=>res.json(await rpcHttp(clients.paper,'getPaperAccess',{actorUserId:req.auth.userId,paperId:req.params.id}))));
api.patch('/papers/:id', authenticate, requireUser([]), wrap(async(req,res)=>res.json(await rpcHttp(clients.paper,'updatePaper',{...req.body,actorUserId:req.auth.userId,paperId:req.params.id}))));
api.post('/profile/avatar', authenticate, requireUser([]), upload.single('file'), wrap(async(req,res)=>{
  if(!req.file) return res.status(400).json({error:'Image file is required'});
  if(!req.file.mimetype.startsWith('image/')) return res.status(400).json({error:'Only images are accepted'});
  if(req.file.size>5*1024*1024) return res.status(413).json({error:'Profile image must be 5 MB or smaller'});
  // H-1 fix: always use the authenticated user's own ID. Ignore req.body.userId to prevent
  // any user from overwriting another user's avatar by supplying a foreign userId in the body.
  const userId = req.auth.userId;
  const uploaded=await uploadPublicBuffer(req.file,process.env.CLOUDINARY_PROFILES_FOLDER||'college-erp/profiles','image');
  try {
    const result=await rpcHttp(clients.paper,'updateProfileAsset',{actorUserId:req.auth.userId,userId,cloudinaryPublicId:uploaded.public_id,originalFilename:req.file.originalname,bytesSize:req.file.size});
    res.status(201).json({
      ...result,
      avatarUrl: uploaded.secure_url,
      avatarPublicId: uploaded.public_id
    });
  } catch(e){
    await deleteAuthenticatedAsset(uploaded.public_id,'image').catch(()=>{});
    throw e;
  }
}));

app.use('/api/v1', api);
app.use((_req,res)=>res.status(404).json({error:'Route not found',code:'NOT_FOUND'}));
app.use((err,req,res,_next)=>{
  const status=Number(err.status)||(err.code==='ER_DUP_ENTRY'?409:err.code==='ER_NO_REFERENCED_ROW_2'?400:statusForGrpc(err.code))||500;
  const message=status>=500?(status===503?err.message:'Internal server error'):(err.publicMessage||err.message||'Request failed');
  if(status>=500) logger.error({requestId:req.requestId,err:err.message,stack:err.stack,grpcCode:err.code},'Gateway request failed');
  const body = { error: message, code: err.codeName || 'REQUEST_FAILED', requestId: req.requestId };
  if (status < 500) body.details = err.details || err.message;
  res.status(status).json(body);
});

const defaultPort = process.env.RENDER || config.nodeEnv === 'production' ? 10000 : 4000;
const port = Number(process.env.PORT || defaultPort);
connectRedis();
const server=app.listen(port,'0.0.0.0',()=>logger.info({port,environment:config.nodeEnv},'Express API Gateway started'));
function shutdown(){server.close(()=>process.exit(0));}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
