import { randomUUID } from 'node:crypto';
import { pool, withTransaction } from '../../shared/db.js';
import { erpProto, startGrpcService } from '../../shared/grpc.js';
import { badRequest, forbidden, notFound, conflict } from '../../shared/errors.js';
import { enqueueNotification } from '../../shared/notify.js';
import { logger } from '../../shared/logger.js';

const threshold = Number(process.env.LOW_ATTENDANCE_THRESHOLD || 75);
async function getActor(id, conn=pool) { const [rows]=await conn.execute('SELECT id,account_type,is_admin,is_active FROM users WHERE id=?',[id]); return rows[0]; }
async function requireAssignment(actorUserId,classSubjectId,conn=pool) {
  const actor=await getActor(actorUserId,conn); if(!actor?.is_active) throw forbidden('Active account required');
  if(actor.is_admin) return actor;
  if(actor.account_type!=='TEACHER') throw forbidden('Teacher access required');
  const [rows]=await conn.execute(`SELECT id FROM teaching_assignments WHERE teacher_user_id=? AND class_subject_id=? AND status='ACTIVE' LIMIT 1`,[actorUserId,classSubjectId]);
  if(!rows[0]) throw forbidden('Teacher is not assigned to this class subject'); return actor;
}
async function getRoster(classSubjectId,conn=pool) {
  const [rows]=await conn.execute(`SELECT sp.user_id studentUserId,sp.enrollment_no rollNo,u.full_name name FROM class_subjects cs JOIN enrollments e ON e.class_section_id=cs.class_section_id AND e.status='ACTIVE' JOIN student_profiles sp ON sp.user_id=e.student_user_id JOIN users u ON u.id=sp.user_id WHERE cs.id=? AND u.is_active=1 ORDER BY sp.enrollment_no`,[classSubjectId]);
  return rows;
}
function normalizeStatus(status) { return String(status||'').trim().toUpperCase(); }
async function saveRegister(input, {entryMode='MANUAL'}={}) {
  const {actorUserId,classSubjectId,sessionDate,lectureNo=1}=input;
  if(!actorUserId||!classSubjectId||!sessionDate||!Array.isArray(input.records)||!input.records.length) throw badRequest('classSubjectId, sessionDate and records are required');
  await requireAssignment(actorUserId,classSubjectId);
  const roster=await getRoster(classSubjectId);
  if(!roster.length) throw badRequest('No active enrolled students in this class');
  const byId=new Map(roster.map(s=>[s.studentUserId,s])); const byRoll=new Map(roster.map(s=>[s.rollNo,s]));
  const mapped=[]; const seen=new Set();
  for(const r of input.records){
    const student=byId.get(r.studentUserId||r.studentId)||byRoll.get(String(r.rollNo||r.rollNumber||''));
    if(!student) throw badRequest(`Unknown or unenrolled student: ${r.rollNo||r.rollNumber||r.studentUserId||r.studentId||'(missing identifier)'}`);
    if(seen.has(student.studentUserId)) throw badRequest(`Duplicate attendance row for ${student.rollNo}`); seen.add(student.studentUserId);
    const status=normalizeStatus(r.status);
    if(!['PRESENT','ABSENT','LATE','EXCUSED'].includes(status)) throw badRequest(`Invalid attendance status for ${student.rollNo}`);
    mapped.push({studentUserId:student.studentUserId,status,remarks:r.remarks||null});
  }
  if(mapped.length!==roster.length) throw badRequest(`Register incomplete: ${roster.length-mapped.length} student(s) have no status. Review missing students before saving.`);
  return withTransaction(async conn=>{
    const [existing]=await conn.execute(`SELECT * FROM attendance_sessions WHERE class_subject_id=? AND session_date=? AND lecture_no=? FOR UPDATE`,[classSubjectId,sessionDate,lectureNo]);
    let sessionId;
    if(existing[0]) { if(existing[0].status==='FINALIZED') throw conflict('This attendance session is finalized'); sessionId=existing[0].id; await conn.execute('UPDATE attendance_sessions SET entry_mode=?,marked_by_user_id=? WHERE id=?',[entryMode,actorUserId,sessionId]); }
    else { sessionId=randomUUID(); await conn.execute(`INSERT INTO attendance_sessions (id,class_subject_id,session_date,lecture_no,marked_by_user_id,entry_mode,status) VALUES (?,?,?,?,?,?,'DRAFT')`,[sessionId,classSubjectId,sessionDate,lectureNo,actorUserId,entryMode]); }
    for(const row of mapped){ const id=randomUUID(); await conn.execute(`INSERT INTO attendance_records (id,session_id,student_user_id,status,marked_by_user_id,remarks) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),marked_by_user_id=VALUES(marked_by_user_id),remarks=VALUES(remarks)`,[id,sessionId,row.studentUserId,row.status,actorUserId,row.remarks]); }
    return {sessionId,classSubjectId,sessionDate,lectureNo,entryMode,status:'DRAFT',saved:mapped.length};
  });
}
async function computeLowAttendance({actorUserId,classSubjectId,conn=pool,forFollowup=false}) {
  const actor=await getActor(actorUserId,conn); if(!actor?.is_active) throw forbidden('Active account required');
  let assignmentJoin=''; let args=[];
  if(!actor.is_admin && actor.account_type==='TEACHER') { assignmentJoin=`JOIN teaching_assignments ta ON ta.class_subject_id=cs.id AND ta.teacher_user_id=? AND ta.status='ACTIVE'`; args.push(actorUserId); }
  else if(!actor.is_admin && actor.account_type!=='STUDENT') throw forbidden('Insufficient permissions');
  const filters=[];
  if(classSubjectId) { filters.push('cs.id=?'); args.push(classSubjectId); }
  if(actor.account_type==='STUDENT'&&!actor.is_admin){filters.push('sp.user_id=?');args.push(actorUserId);}
  const where=filters.length?`AND ${filters.join(' AND ')}`:'';
  const [rows]=await conn.execute(`SELECT sp.user_id studentUserId,u.full_name studentName,u.email,sp.enrollment_no rollNo,cs.id classSubjectId,s.name subjectName,s.code subjectCode,cl.section_name sectionName,
    COUNT(CASE WHEN ar.status IN ('PRESENT','ABSENT','LATE') THEN 1 END) eligibleSessions,
    SUM(CASE WHEN ar.status IN ('PRESENT','LATE') THEN 1 ELSE 0 END) attendedSessions,
    ROUND(100.0*SUM(CASE WHEN ar.status IN ('PRESENT','LATE') THEN 1 ELSE 0 END)/NULLIF(COUNT(CASE WHEN ar.status IN ('PRESENT','ABSENT','LATE') THEN 1 END),0),2) attendancePercent
    FROM class_subjects cs JOIN class_sections cl ON cl.id=cs.class_section_id JOIN subjects s ON s.id=cs.subject_id
    JOIN enrollments e ON e.class_section_id=cl.id AND e.status='ACTIVE' JOIN student_profiles sp ON sp.user_id=e.student_user_id JOIN users u ON u.id=sp.user_id
    LEFT JOIN attendance_sessions ses ON ses.class_subject_id=cs.id AND ses.status='FINALIZED'
    LEFT JOIN attendance_records ar ON ar.session_id=ses.id AND ar.student_user_id=sp.user_id
    ${assignmentJoin}
    WHERE u.is_active=1 ${where}
    GROUP BY sp.user_id,u.full_name,u.email,sp.enrollment_no,cs.id,s.name,s.code,cl.section_name
    HAVING eligibleSessions > 0 AND attendancePercent < ? ORDER BY attendancePercent,studentName`,[...args,Number(process.env.LOW_ATTENDANCE_THRESHOLD||75)]);
  return rows;
}
const handlers = {
  async saveAttendanceRegister(input) { return saveRegister(input,{entryMode:'MANUAL'}); },
  async previewAttendanceImport(input) {
    const {actorUserId,classSubjectId,sessionDate,lectureNo=1,rows=[]}=input;
    if(!Array.isArray(rows)||rows.length===0||rows.length>1500) throw badRequest('rows must contain between 1 and 1500 records');
    await requireAssignment(actorUserId,classSubjectId);
    const roster=await getRoster(classSubjectId); const byRoll=new Map(roster.map(s=>[s.rollNo,s])); const seen=new Set(); const errors=[]; const normalized=[];
    rows.forEach((r,i)=>{
      const rowNumber=i+2; const roll=String(r.rollNo||r.roll_no||r.rollNumber||r.enrollmentNo||'').trim(); const status=normalizeStatus(r.status||r.attendance);
      if(!roll){errors.push({row:rowNumber,code:'MISSING_ROLL_NO',message:'Student roll/enrollment number is missing'});return;}
      if(seen.has(roll)){errors.push({row:rowNumber,code:'DUPLICATE_ROLL_NO',message:`Duplicate row for ${roll}`});return;} seen.add(roll);
      const student=byRoll.get(roll); if(!student){errors.push({row:rowNumber,code:'UNKNOWN_STUDENT',message:`${roll} is not enrolled in this class`});return;}
      if(!['PRESENT','ABSENT','LATE','EXCUSED'].includes(status)){errors.push({row:rowNumber,code:'INVALID_STATUS',message:`Invalid status for ${roll}`});return;}
      normalized.push({studentUserId:student.studentUserId,rollNo:roll,status});
    });
    const missing=roster.filter(s=>!seen.has(s.rollNo)).map(s=>({row:null,code:'MISSING_STUDENT',rollNo:s.rollNo,message:`${s.rollNo} has no row; do not silently treat as absent`}));
    errors.push(...missing);
    const jobId=randomUUID(); const status=errors.length?'INVALID':'PREVIEWED';
    await pool.execute(`INSERT INTO attendance_import_jobs (id,teacher_user_id,class_subject_id,session_date,lecture_no,status,input_rows,valid_rows,error_rows,rows_json,errors_json,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 HOUR))`,[jobId,actorUserId,classSubjectId,sessionDate,lectureNo,status,rows.length,normalized.length,errors.length,JSON.stringify(normalized),JSON.stringify(errors)]);
    return {jobId,status,totalRows:rows.length,validRows:normalized.length,errorCount:errors.length,errors,rows:normalized};
  },
  async commitAttendanceImport(input) {
    const [jobs]=await pool.execute('SELECT * FROM attendance_import_jobs WHERE id=?',[input.jobId]); const job=jobs[0];
    if(!job) throw notFound('Import job not found'); if(job.teacher_user_id!==input.actorUserId) throw forbidden('Import belongs to another teacher');
    if(job.status!=='PREVIEWED'||Number(job.error_rows)>0) throw badRequest('Only a clean preview can be committed; correct and upload the spreadsheet again');
    if(job.expires_at && new Date(job.expires_at).getTime()<Date.now()) throw badRequest('Import preview expired; upload again');
    const rows=typeof job.rows_json==='string'?JSON.parse(job.rows_json):job.rows_json;
    const result=await saveRegister({actorUserId:input.actorUserId,classSubjectId:job.class_subject_id,sessionDate:job.session_date instanceof Date?job.session_date.toISOString().slice(0,10):String(job.session_date).slice(0,10),lectureNo:job.lecture_no,records:rows},{entryMode:'EXCEL'});
    await pool.execute(`UPDATE attendance_import_jobs SET status='COMMITTED' WHERE id=?`,[input.jobId]);
    return {...result,importJobId:input.jobId,status:'COMMITTED'};
  },
  async finalizeAttendanceSession(input) {
    const [rows]=await pool.execute('SELECT * FROM attendance_sessions WHERE id=?',[input.sessionId]); if(!rows[0]) throw notFound('Attendance session not found');
    await requireAssignment(input.actorUserId,rows[0].class_subject_id);
    const roster=await getRoster(rows[0].class_subject_id); const [count]=await pool.execute('SELECT COUNT(*) AS total FROM attendance_records WHERE session_id=?',[input.sessionId]);
    if(Number(count[0].total)!==roster.length) throw badRequest('Cannot finalize an incomplete attendance register');
    await pool.execute(`UPDATE attendance_sessions SET status='FINALIZED',finalized_at=UTC_TIMESTAMP() WHERE id=? AND status='DRAFT'`,[input.sessionId]);
    return {sessionId:input.sessionId,status:'FINALIZED'};
  },
  async getLowAttendance(input) {
    const rows=await computeLowAttendance({actorUserId:input.actorUserId,classSubjectId:input.classSubjectId});
    return {threshold:Number(process.env.LOW_ATTENDANCE_THRESHOLD||75),items:rows};
  },
  async getStudentAttendanceSummary(input) {
    const actor=await getActor(input.actorUserId); if(!actor?.is_active) throw forbidden('Active account required');
    const studentUserId=input.studentUserId||input.actorUserId; if(!actor.is_admin&&studentUserId!==input.actorUserId) throw forbidden('Cannot view another student attendance');
    const [rows]=await pool.execute(`SELECT cs.id classSubjectId,s.name subjectName,s.code subjectCode,cl.section_name sectionName,
      COUNT(CASE WHEN ar.status IN ('PRESENT','ABSENT','LATE') THEN 1 END) eligibleSessions,
      SUM(CASE WHEN ar.status IN ('PRESENT','LATE') THEN 1 ELSE 0 END) attendedSessions,
      ROUND(100.0*SUM(CASE WHEN ar.status IN ('PRESENT','LATE') THEN 1 ELSE 0 END)/NULLIF(COUNT(CASE WHEN ar.status IN ('PRESENT','ABSENT','LATE') THEN 1 END),0),2) attendancePercent
      FROM enrollments e JOIN class_sections cl ON cl.id=e.class_section_id JOIN class_subjects cs ON cs.class_section_id=cl.id JOIN subjects s ON s.id=cs.subject_id
      LEFT JOIN attendance_sessions ses ON ses.class_subject_id=cs.id AND ses.status='FINALIZED' LEFT JOIN attendance_records ar ON ar.session_id=ses.id AND ar.student_user_id=e.student_user_id
      WHERE e.student_user_id=? AND e.status='ACTIVE' GROUP BY cs.id,s.name,s.code,cl.section_name ORDER BY s.name`,[studentUserId]);
    const eligible=rows.reduce((sum,r)=>sum+Number(r.eligibleSessions||0),0); const attended=rows.reduce((sum,r)=>sum+Number(r.attendedSessions||0),0);
    return {currentAttendance:eligible?Number((100*attended/eligible).toFixed(2)):null,activeSubjects:rows.length,subjects:rows,threshold:Number(process.env.LOW_ATTENDANCE_THRESHOLD||75)};
  },
  async createFollowup(input) {
    const {actorUserId,studentUserId,reason='Attendance below required threshold'}=input;
    let classSubjectId=input.classSubjectId;
    if(!classSubjectId && !input.subjectName) throw badRequest('classSubjectId or subjectName is required');
    if(!classSubjectId || !/^[0-9a-f-]{36}$/i.test(String(classSubjectId))){
      const creator=await getActor(actorUserId);
      const subjectName=String(input.subjectName||classSubjectId||'').trim();
      const teacherJoin=creator?.is_admin?'':`JOIN teaching_assignments ta ON ta.class_subject_id=cs.id AND ta.teacher_user_id=? AND ta.status='ACTIVE'`;
      const query=`SELECT cs.id FROM class_subjects cs JOIN subjects s ON s.id=cs.subject_id ${teacherJoin} JOIN class_sections cl ON cl.id=cs.class_section_id JOIN enrollments e ON e.class_section_id=cl.id AND e.student_user_id=? AND e.status='ACTIVE' WHERE LOWER(s.name)=LOWER(?) ORDER BY cl.year_of_study DESC LIMIT 1`;
      const args=creator?.is_admin?[studentUserId,subjectName]:[actorUserId,studentUserId,subjectName];
      const [matches]=await pool.execute(query,args);
      classSubjectId=matches[0]?.id;
      if(!classSubjectId) throw notFound('Could not find an assigned subject offering for this student');
    }
    await requireAssignment(actorUserId,classSubjectId);
    const low=await computeLowAttendance({actorUserId,classSubjectId}); const student=low.find(s=>s.studentUserId===studentUserId);
    if(!student) throw badRequest('Student is not below the configured attendance threshold for this subject, or has no finalized attendance');
    let contactTeacherUserId=input.contactTeacherUserId||actorUserId;
    const creator=await getActor(actorUserId);
    if(creator?.is_admin&&!input.contactTeacherUserId){const [assigned]=await pool.execute(`SELECT teacher_user_id FROM teaching_assignments WHERE class_subject_id=? AND status='ACTIVE' ORDER BY assigned_at LIMIT 1`,[classSubjectId]);contactTeacherUserId=assigned[0]?.teacher_user_id||null;}
    if(!contactTeacherUserId) throw badRequest('Assign a teacher contact before creating the follow-up');
    const [contact]=await pool.execute(`SELECT user_id FROM faculty_profiles WHERE user_id=?`,[contactTeacherUserId]); if(!contact[0]) throw badRequest('Contact teacher was not found');
    if(contactTeacherUserId!==actorUserId){ const actor=await getActor(actorUserId); if(!actor?.is_admin) throw forbidden('Only admins may assign a different contact teacher'); }
    const id=randomUUID();
    await withTransaction(async conn=>{
      await conn.execute(`INSERT INTO student_attendance_followups (id,student_user_id,class_subject_id,attendance_percent,required_percent,reason,tagged_by_user_id,contact_teacher_user_id,status) VALUES (?,?,?,?,?,?,?,?, 'OPEN')`,[id,studentUserId,classSubjectId,student.attendancePercent,threshold,String(reason).slice(0,255),actorUserId,contactTeacherUserId]);
      await enqueueNotification({recipientUserId:studentUserId,eventKey:`attendance-followup:${id}`,type:'LOW_ATTENDANCE',title:'Low attendance warning',message:`Your attendance in ${student.subjectName} is ${student.attendancePercent}%. Please meet your assigned teacher to discuss how to improve it.`,entityType:'ATTENDANCE_FOLLOWUP',entityId:id},conn);
    });
    return {id,studentUserId,classSubjectId,attendancePercent:student.attendancePercent,requiredPercent:threshold,contactTeacherUserId,status:'OPEN'};
  },
  async listFollowups(input) {
    const actor=await getActor(input.actorUserId); if(!actor?.is_active) throw forbidden('Active account required');
    let where=''; let args=[];
    if(actor.is_admin) {}
    else if(actor.account_type==='STUDENT'){where='WHERE f.student_user_id=?';args=[input.actorUserId];}
    else if(actor.account_type==='TEACHER'){where='WHERE (f.tagged_by_user_id=? OR f.contact_teacher_user_id=?)';args=[input.actorUserId,input.actorUserId];}
    else throw forbidden('Access denied');
    const [rows]=await pool.execute(`SELECT f.*,u.full_name student_name,sp.enrollment_no roll_no,s.name subject_name,ct.full_name contact_teacher_name FROM student_attendance_followups f JOIN users u ON u.id=f.student_user_id JOIN student_profiles sp ON sp.user_id=f.student_user_id JOIN class_subjects cs ON cs.id=f.class_subject_id JOIN subjects s ON s.id=cs.subject_id JOIN users ct ON ct.id=f.contact_teacher_user_id ${where} ORDER BY f.created_at DESC`,args);
    return {items:rows};
  },
  async publishAvailability(input) {
    const actor=await getActor(input.actorUserId); if(!actor?.is_active||actor.account_type!=='TEACHER') throw forbidden('Teacher access required');
    if(!Array.isArray(input.slots)||!input.slots.length||input.slots.length>100) throw badRequest('slots must have 1 to 100 entries');
    const prepared=input.slots.map(s=>({start:new Date(s.startsAt),end:new Date(s.endsAt)}));
    for(const s of prepared) if(!Number.isFinite(s.start.getTime())||!Number.isFinite(s.end.getTime())||s.end<=s.start||s.start<=new Date()) throw badRequest('Each slot must have valid future start/end timestamps');
    return withTransaction(async conn=>{
      const inserted=[];
      for(const s of prepared){
        const [overlaps]=await conn.execute(`SELECT id FROM teacher_availability_slots WHERE teacher_user_id=? AND status IN ('AVAILABLE','REQUESTED','BOOKED','BLOCKED') AND starts_at_utc < ? AND ends_at_utc > ? FOR UPDATE`,[input.actorUserId,s.end,s.start]);
        if(overlaps.length) throw conflict('Availability slots cannot overlap');
        const id=randomUUID(); await conn.execute(`INSERT INTO teacher_availability_slots (id,teacher_user_id,starts_at_utc,ends_at_utc,status) VALUES (?,?,?,?,'AVAILABLE')`,[id,input.actorUserId,s.start,s.end]); inserted.push({id,startsAt:s.start.toISOString(),endsAt:s.end.toISOString()});
      }
      return {slots:inserted};
    });
  },
  async listAvailableSlots(input) {
    const actor=await getActor(input.actorUserId); if(!actor?.is_active) throw forbidden('Active account required');
    const [followups]=await pool.execute('SELECT student_user_id,contact_teacher_user_id FROM student_attendance_followups WHERE id=?',[input.followupId]); const f=followups[0]; if(!f) throw notFound('Attendance follow-up not found');
    if(!actor.is_admin&&(actor.account_type!=='STUDENT'||f.student_user_id!==input.actorUserId)) throw forbidden('Only the student who owns this follow-up may request a meeting');
    const [slots]=await pool.execute(`SELECT id,teacher_user_id,starts_at_utc,ends_at_utc FROM teacher_availability_slots WHERE teacher_user_id=? AND status='AVAILABLE' AND starts_at_utc>UTC_TIMESTAMP() ORDER BY starts_at_utc LIMIT 100`,[f.contact_teacher_user_id]);
    return {items:slots};
  },
  async requestMeeting(input) {
    const actor=await getActor(input.actorUserId); if(!actor?.is_active||actor.account_type!=='STUDENT') throw forbidden('Student access required');
    const idempotencyKey=input.idempotencyKey||null;
    if(idempotencyKey){ const [old]=await pool.execute('SELECT id,status FROM appointments WHERE student_user_id=? AND idempotency_key=?',[actor.id,idempotencyKey]); if(old[0]) return {id:old[0].id,status:old[0].status,reused:true}; }
    return withTransaction(async conn=>{
      const [fRows]=await conn.execute('SELECT * FROM student_attendance_followups WHERE id=? FOR UPDATE',[input.followupId]); const f=fRows[0];
      if(!f||f.student_user_id!==input.actorUserId) throw forbidden('Follow-up does not belong to this student');
      if(f.status==='RESOLVED') throw conflict('This attendance follow-up has been resolved');
      const [existing]=await conn.execute(`SELECT id,status FROM appointments WHERE followup_id=? AND status IN ('REQUESTED','CONFIRMED','RESCHEDULE_PROPOSED')`,[input.followupId]);
      if(existing[0]) throw conflict('There is already an active appointment for this follow-up');
      const [sRows]=await conn.execute('SELECT * FROM teacher_availability_slots WHERE id=? FOR UPDATE',[input.slotId]); const slot=sRows[0];
      if(!slot||slot.teacher_user_id!==f.contact_teacher_user_id||slot.status!=='AVAILABLE') throw conflict('Selected slot is no longer available for this teacher');
      if(new Date(slot.starts_at_utc).getTime()<=Date.now()) throw badRequest('Cannot request a meeting in the past');
      const id=randomUUID();
      await conn.execute(`INSERT INTO appointments (id,followup_id,student_user_id,teacher_user_id,slot_id,status,student_message,idempotency_key) VALUES (?,?,?,?,?,'REQUESTED',?,?)`,[id,input.followupId,actor.id,f.contact_teacher_user_id,slot.id,String(input.message||'').slice(0,500)||null,idempotencyKey]);
      await conn.execute(`UPDATE teacher_availability_slots SET status='REQUESTED' WHERE id=?`,[slot.id]);
      await conn.execute(`UPDATE student_attendance_followups SET status='MEETING_REQUESTED' WHERE id=?`,[input.followupId]);
      await enqueueNotification({recipientUserId:f.contact_teacher_user_id,eventKey:`meeting-requested:${id}:teacher`,type:'MEETING_REQUESTED',title:'New student meeting request',message:'A student has requested an appointment to discuss low attendance.',entityType:'APPOINTMENT',entityId:id},conn);
      await enqueueNotification({recipientUserId:actor.id,eventKey:`meeting-requested:${id}:student`,type:'MEETING_REQUESTED',title:'Meeting request submitted',message:'Your request has been sent to your teacher. The appointment is pending approval.',entityType:'APPOINTMENT',entityId:id},conn);
      return {id,status:'REQUESTED',teacherUserId:f.contact_teacher_user_id,slotId:slot.id,startsAt:slot.starts_at_utc,endsAt:slot.ends_at_utc};
    });
  },
  async listMeetings(input) {
    const actor=await getActor(input.actorUserId); if(!actor?.is_active) throw forbidden('Active account required');
    let where=''; let args=[];
    if(actor.is_admin) { if(input.status&&input.status!=='ALL'){where='WHERE a.status=?';args=[input.status];} }
    else if(actor.account_type==='STUDENT'){where='WHERE a.student_user_id=?';args=[actor.id];if(input.status&&input.status!=='ALL'){where+=' AND a.status=?';args.push(input.status);}}
    else if(actor.account_type==='TEACHER'){where='WHERE a.teacher_user_id=?';args=[actor.id];if(input.status&&input.status!=='ALL'){where+=' AND a.status=?';args.push(input.status);}}
    else throw forbidden('Access denied');
    const [rows]=await pool.execute(`SELECT a.*,su.full_name student_name,sp.enrollment_no roll_no,tu.full_name teacher_name,s.name subject_name,slot.starts_at_utc,slot.ends_at_utc,slot.status slot_status FROM appointments a JOIN users su ON su.id=a.student_user_id JOIN student_profiles sp ON sp.user_id=a.student_user_id JOIN users tu ON tu.id=a.teacher_user_id JOIN student_attendance_followups f ON f.id=a.followup_id JOIN class_subjects cs ON cs.id=f.class_subject_id JOIN subjects s ON s.id=cs.subject_id JOIN teacher_availability_slots slot ON slot.id=COALESCE(a.proposed_slot_id,a.slot_id) ${where} ORDER BY slot.starts_at_utc DESC LIMIT 200`,args);
    return {items:rows};
  },
  async respondToMeeting(input) {
    const actor=await getActor(input.actorUserId); if(!actor?.is_active) throw forbidden('Active account required');
    return withTransaction(async conn=>{
      const [rows]=await conn.execute('SELECT * FROM appointments WHERE id=? FOR UPDATE',[input.appointmentId]); const a=rows[0]; if(!a) throw notFound('Appointment not found');
      const action=String(input.action||'').toUpperCase(); const isStudent=actor.account_type==='STUDENT'&&a.student_user_id===actor.id; const isTeacher=(actor.account_type==='TEACHER'&&a.teacher_user_id===actor.id)||actor.is_admin;
      if(action==='ACCEPT_PROPOSAL'){
        if(!isStudent||a.status!=='RESCHEDULE_PROPOSED'||!a.proposed_slot_id) throw forbidden('No proposal available to accept');
        const [ps]=await conn.execute('SELECT * FROM teacher_availability_slots WHERE id=? FOR UPDATE',[a.proposed_slot_id]); const proposed=ps[0]; if(!proposed||proposed.status!=='REQUESTED') throw conflict('Proposed slot is no longer available');
        await conn.execute(`UPDATE teacher_availability_slots SET status=CASE WHEN id=? THEN 'AVAILABLE' ELSE 'BOOKED' END WHERE id IN (?,?)`,[a.slot_id,a.slot_id,a.proposed_slot_id]);
        await conn.execute(`UPDATE appointments SET slot_id=proposed_slot_id,proposed_slot_id=NULL,status='CONFIRMED',updated_by_user_id=?,responded_at=UTC_TIMESTAMP() WHERE id=?`,[actor.id,a.id]);
        await conn.execute(`UPDATE student_attendance_followups SET status='MEETING_REQUESTED' WHERE id=?`,[a.followup_id]);
        await enqueueNotification({recipientUserId:a.teacher_user_id,eventKey:`meeting-confirmed:${a.id}:teacher`,type:'MEETING_CONFIRMED',title:'Student accepted proposed time',message:'The student accepted your alternative appointment time.',entityType:'APPOINTMENT',entityId:a.id},conn);
        return {id:a.id,status:'CONFIRMED'};
      }
      if(!isTeacher) throw forbidden('Only the assigned teacher can respond');
      if(action==='COMPLETE'){
        if(a.status!=='CONFIRMED') throw conflict('Only a confirmed appointment can be completed');
        await conn.execute(`UPDATE appointments SET status='COMPLETED',updated_by_user_id=?,responded_at=UTC_TIMESTAMP() WHERE id=?`,[actor.id,a.id]);
        await conn.execute(`UPDATE student_attendance_followups SET status='RESOLVED' WHERE id=?`,[a.followup_id]);
        await enqueueNotification({recipientUserId:a.student_user_id,eventKey:`meeting-completed:${a.id}:student`,type:'MEETING_COMPLETED',title:'Attendance meeting completed',message:'Your teacher marked the attendance meeting as completed.',entityType:'APPOINTMENT',entityId:a.id},conn);
        return {id:a.id,status:'COMPLETED'};
      }
      if(a.status!=='REQUESTED'&&!(action==='DECLINE'&&a.status==='RESCHEDULE_PROPOSED')) throw conflict('Appointment is not awaiting a response');
      if(action==='ACCEPT'){
        if(a.status!=='REQUESTED') throw conflict('Accept the proposed alternative from the student portal');
        await conn.execute(`UPDATE teacher_availability_slots SET status='BOOKED' WHERE id=?`,[a.slot_id]);
        await conn.execute(`UPDATE appointments SET status='CONFIRMED',teacher_response=?,meeting_location=?,updated_by_user_id=?,responded_at=UTC_TIMESTAMP() WHERE id=?`,[String(input.responseMessage||'Accepted').slice(0,500),String(input.meetingLocation||'Faculty office').slice(0,255),actor.id,a.id]);
        await enqueueNotification({recipientUserId:a.student_user_id,eventKey:`meeting-confirmed:${a.id}:student`,type:'MEETING_CONFIRMED',title:'Meeting confirmed',message:`Your teacher confirmed the appointment. Location: ${input.meetingLocation||'Faculty office'}.`,entityType:'APPOINTMENT',entityId:a.id},conn);
        return {id:a.id,status:'CONFIRMED'};
      }
      if(action==='DECLINE'){
        await conn.execute(`UPDATE teacher_availability_slots SET status='AVAILABLE' WHERE id=? AND starts_at_utc>UTC_TIMESTAMP()`,[a.slot_id]);
        if(a.proposed_slot_id) await conn.execute(`UPDATE teacher_availability_slots SET status='AVAILABLE' WHERE id=? AND starts_at_utc>UTC_TIMESTAMP()`,[a.proposed_slot_id]);
        await conn.execute(`UPDATE appointments SET status='DECLINED',teacher_response=?,updated_by_user_id=?,responded_at=UTC_TIMESTAMP(),proposed_slot_id=NULL WHERE id=?`,[String(input.responseMessage||'Request declined').slice(0,500),actor.id,a.id]);
        await conn.execute(`UPDATE student_attendance_followups SET status='OPEN' WHERE id=?`,[a.followup_id]);
        await enqueueNotification({recipientUserId:a.student_user_id,eventKey:`meeting-declined:${a.id}:student`,type:'MEETING_DECLINED',title:'Meeting request declined',message:String(input.responseMessage||'Your teacher declined the request. Please choose another available time.'),entityType:'APPOINTMENT',entityId:a.id},conn);
        return {id:a.id,status:'DECLINED'};
      }
      if(action==='PROPOSE_ALTERNATIVE'){
        if(!input.alternateSlotId) throw badRequest('alternateSlotId required');
        const [ps]=await conn.execute('SELECT * FROM teacher_availability_slots WHERE id=? FOR UPDATE',[input.alternateSlotId]); const alt=ps[0];
        if(!alt||alt.teacher_user_id!==a.teacher_user_id||alt.status!=='AVAILABLE'||new Date(alt.starts_at_utc).getTime()<=Date.now()) throw conflict('Alternative slot unavailable');
        const [overlaps]=await conn.execute(`SELECT id FROM teacher_availability_slots WHERE teacher_user_id=? AND id<>? AND status IN ('BOOKED','REQUESTED') AND starts_at_utc<? AND ends_at_utc>?`,[a.teacher_user_id,alt.id,alt.ends_at_utc,alt.starts_at_utc]); if(overlaps.length) throw conflict('Alternative slot overlaps an existing booked slot');
        await conn.execute(`UPDATE teacher_availability_slots SET status='AVAILABLE' WHERE id=? AND status='REQUESTED'`,[a.slot_id]);
        await conn.execute(`UPDATE teacher_availability_slots SET status='REQUESTED' WHERE id=?`,[alt.id]);
        await conn.execute(`UPDATE appointments SET status='RESCHEDULE_PROPOSED',proposed_slot_id=?,teacher_response=?,updated_by_user_id=?,responded_at=UTC_TIMESTAMP() WHERE id=?`,[alt.id,String(input.responseMessage||'Please accept this alternative time').slice(0,500),actor.id,a.id]);
        await enqueueNotification({recipientUserId:a.student_user_id,eventKey:`meeting-proposed:${a.id}:student`,type:'MEETING_RESCHEDULE_PROPOSED',title:'Alternative meeting time proposed',message:String(input.responseMessage||'Your teacher proposed another time. Review and accept it in your meetings page.'),entityType:'APPOINTMENT',entityId:a.id},conn);
        return {id:a.id,status:'RESCHEDULE_PROPOSED',proposedSlotId:alt.id};
      }
      throw badRequest('action must be ACCEPT, DECLINE, PROPOSE_ALTERNATIVE, ACCEPT_PROPOSAL, or COMPLETE');
    });
  },
  async cancelMeeting(input) {
    const actor=await getActor(input.actorUserId); if(!actor?.is_active) throw forbidden('Active account required');
    return withTransaction(async conn=>{
      const [rows]=await conn.execute('SELECT * FROM appointments WHERE id=? FOR UPDATE',[input.appointmentId]); const a=rows[0]; if(!a) throw notFound('Appointment not found');
      const byStudent=actor.account_type==='STUDENT'&&a.student_user_id===actor.id; const byTeacher=actor.account_type==='TEACHER'&&a.teacher_user_id===actor.id; if(!byStudent&&!byTeacher&&!actor.is_admin) throw forbidden('Cannot cancel this appointment');
      if(!['REQUESTED','CONFIRMED','RESCHEDULE_PROPOSED'].includes(a.status)) throw conflict('Appointment cannot be cancelled in its current state');
      const status=byStudent?'CANCELLED_BY_STUDENT':'CANCELLED_BY_TEACHER';
      await conn.execute(`UPDATE teacher_availability_slots SET status='AVAILABLE' WHERE id IN (?,?) AND starts_at_utc>UTC_TIMESTAMP() AND status IN ('REQUESTED','BOOKED')`,[a.slot_id,a.proposed_slot_id||a.slot_id]);
      await conn.execute('UPDATE appointments SET status=?,updated_by_user_id=?,teacher_response=? WHERE id=?',[status,actor.id,String(input.reason||'Appointment cancelled').slice(0,500),a.id]);
      await conn.execute(`UPDATE student_attendance_followups SET status='OPEN' WHERE id=?`,[a.followup_id]);
      const recipient=byStudent?a.teacher_user_id:a.student_user_id;
      await enqueueNotification({recipientUserId:recipient,eventKey:`meeting-cancelled:${a.id}:${status}`,type:'MEETING_CANCELLED',title:'Appointment cancelled',message:'An appointment has been cancelled.',entityType:'APPOINTMENT',entityId:a.id},conn);
      return {id:a.id,status};
    });
  }
};

startGrpcService({name:'attendance-service',serviceName:'attendance',address:process.env.ATTENDANCE_GRPC_ADDR||'127.0.0.1:50055',Service:erpProto.AttendanceService,handlers});
logger.info('Attendance service initialized');
