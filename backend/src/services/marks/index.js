import { randomUUID } from 'node:crypto';
import { pool, withTransaction } from '../../shared/db.js';
import { erpProto, startGrpcService } from '../../shared/grpc.js';
import { badRequest, forbidden, notFound } from '../../shared/errors.js';
import { extractPdfText, findMarksForIdentifier } from './pdf-extract.js';
import { logger } from '../../shared/logger.js';

async function actorRow(id, conn = pool) {
  const [rows] = await conn.execute('SELECT id,account_type,is_admin,is_active FROM users WHERE id=? LIMIT 1', [id]);
  return rows[0];
}
async function requireTeacherForAssessment(actorUserId, assessmentId, conn = pool) {
  const actor = await actorRow(actorUserId, conn);
  if (!actor || !actor.is_active) throw forbidden('Active account required');
  const [rows] = await conn.execute(`SELECT a.id,a.class_subject_id,a.max_marks,a.status FROM assessments a WHERE a.id=?`, [assessmentId]);
  if (!rows[0]) throw notFound('Assessment not found');
  if (actor.is_admin) return { actor, assessment: rows[0] };
  if (actor.account_type !== 'TEACHER') throw forbidden('Teacher access required');
  const [assigned] = await conn.execute(`SELECT id FROM teaching_assignments WHERE teacher_user_id=? AND class_subject_id=? AND status='ACTIVE' LIMIT 1`, [actorUserId, rows[0].class_subject_id]);
  if (!assigned[0]) throw forbidden('You are not assigned to this assessment');
  return { actor, assessment: rows[0] };
}
async function rosterForAssessment(assessmentId, conn = pool) {
  const [rows] = await conn.execute(`SELECT sp.user_id student_user_id, sp.enrollment_no roll_no, u.full_name
    FROM assessments a JOIN class_subjects cs ON cs.id=a.class_subject_id
    JOIN enrollments e ON e.class_section_id=cs.class_section_id AND e.status='ACTIVE'
    JOIN student_profiles sp ON sp.user_id=e.student_user_id
    JOIN users u ON u.id=sp.user_id WHERE a.id=? AND u.is_active=1 ORDER BY sp.enrollment_no`, [assessmentId]);
  return rows;
}
const handlers = {
  async createAssessment(input) {
    if (!input.actorUserId || !input.classSubjectId || !input.name || !Number.isFinite(Number(input.maxMarks)) || Number(input.maxMarks) <= 0) throw badRequest('actorUserId, classSubjectId, name and positive maxMarks are required');
    const actor = await actorRow(input.actorUserId);
    if (!actor?.is_active) throw forbidden('Active account required');
    if (!actor.is_admin) {
      const [as] = await pool.execute(`SELECT id FROM teaching_assignments WHERE teacher_user_id=? AND class_subject_id=? AND status='ACTIVE'`, [input.actorUserId,input.classSubjectId]);
      if (!as[0]) throw forbidden('Teacher is not assigned to this class subject');
    }
    const id=randomUUID();
    await pool.execute('INSERT INTO assessments (id,class_subject_id,name,assessment_type,max_marks,held_on,status,created_by_user_id) VALUES (?,?,?,?,?,?,\'OPEN\',?)',[id,input.classSubjectId,input.name,input.assessmentType||'OTHER',Number(input.maxMarks),input.heldOn||null,input.actorUserId]);
    return {id,classSubjectId:input.classSubjectId,name:input.name,assessmentType:input.assessmentType||'OTHER',maxMarks:Number(input.maxMarks),status:'OPEN'};
  },
  async listAssessments(input) {
    const actor=await actorRow(input.actorUserId); if(!actor?.is_active) throw forbidden('Active account required');
    const filter = input.classSubjectId ? 'AND a.class_subject_id=?' : '';
    const args = actor.is_admin ? (input.classSubjectId?[input.classSubjectId]:[]) : (input.classSubjectId?[input.actorUserId,input.classSubjectId]:[input.actorUserId]);
    const join = actor.is_admin ? '' : `JOIN teaching_assignments ta ON ta.class_subject_id=a.class_subject_id AND ta.teacher_user_id=? AND ta.status='ACTIVE'`;
    const [rows]=await pool.execute(`SELECT a.*,s.name subject_name,s.code subject_code,cl.section_name,cl.year_of_study,sem.semester_number FROM assessments a ${join} JOIN class_subjects cs ON cs.id=a.class_subject_id JOIN subjects s ON s.id=cs.subject_id JOIN class_sections cl ON cl.id=cs.class_section_id JOIN semesters sem ON sem.id=cl.semester_id WHERE 1=1 ${filter} ORDER BY a.held_on DESC,a.created_at DESC`,args);
    return {items:rows};
  },
  async getAssessmentMarks(input) {
    const {actor,assessment}=await requireTeacherForAssessment(input.actorUserId,input.assessmentId);
    const [rows]=await pool.execute(`SELECT m.student_user_id studentId,sp.enrollment_no rollNo,u.full_name studentName,CAST(m.marks_obtained AS CHAR) enteredMarks,a.max_marks maxMarks FROM assessments a JOIN class_subjects cs ON cs.id=a.class_subject_id JOIN enrollments e ON e.class_section_id=cs.class_section_id AND e.status='ACTIVE' JOIN student_profiles sp ON sp.user_id=e.student_user_id JOIN users u ON u.id=sp.user_id LEFT JOIN marks m ON m.assessment_id=a.id AND m.student_user_id=sp.user_id WHERE a.id=? ORDER BY sp.enrollment_no`,[input.assessmentId]);
    return {items:rows};
  },
  async enterBulkMarks(input) {
    const {actorUserId,assessmentId,records=[]}=input;
    const {assessment}=await requireTeacherForAssessment(actorUserId,assessmentId);
    if(assessment.status==='PUBLISHED') throw forbidden('Published marks cannot be changed through bulk entry');
    if(!Array.isArray(records)||!records.length||records.length>1000) throw badRequest('records must contain 1 to 1000 rows');
    const roster=await rosterForAssessment(assessmentId); const allowed=new Map(roster.map(r=>[r.student_user_id,r]));
    const seen=new Set();
    for(const row of records){
      if(!allowed.has(row.studentUserId)) throw badRequest(`Student ${row.studentUserId} is not enrolled in the assessment class`);
      if(seen.has(row.studentUserId)) throw badRequest('Duplicate student in marks payload'); seen.add(row.studentUserId);
      if(!Number.isFinite(Number(row.marks))||Number(row.marks)<0||Number(row.marks)>Number(assessment.max_marks)) throw badRequest(`Marks must be between 0 and ${assessment.max_marks}`);
    }
    return withTransaction(async conn=>{
      await conn.execute('INSERT INTO marks_audit_context (connection_id,actor_user_id) VALUES (CONNECTION_ID(),?) ON DUPLICATE KEY UPDATE actor_user_id=VALUES(actor_user_id)',[actorUserId]);
      for(const row of records){
        const id=randomUUID();
        await conn.execute(`INSERT INTO marks (id,assessment_id,student_user_id,marks_obtained,entered_by_user_id,updated_by_user_id) VALUES (?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE marks_obtained=VALUES(marks_obtained),updated_by_user_id=VALUES(updated_by_user_id)`,[id,assessmentId,row.studentUserId,Number(row.marks),actorUserId,actorUserId]);
      }
      await conn.execute('DELETE FROM marks_audit_context WHERE connection_id=CONNECTION_ID()');
      return {assessmentId,saved:records.length};
    });
  },
  async queueMarksPdfValidation(input) {
    const { actorUserId, assessmentId, fileName, pdfBase64, enteredRows=[] }=input;
    if(!pdfBase64 || !fileName) throw badRequest('PDF file and filename are required');
    const {assessment}=await requireTeacherForAssessment(actorUserId,assessmentId);
    if(assessment.status==='PUBLISHED') throw forbidden('Published assessment cannot be revalidated');
    const pdfBuffer=Buffer.from(pdfBase64,'base64');
    const maxBytes=Number(process.env.MARKS_PDF_MAX_MB||8)*1024*1024;
    if(pdfBuffer.length===0||pdfBuffer.length>maxBytes) throw badRequest(`PDF must be non-empty and at most ${process.env.MARKS_PDF_MAX_MB||8} MB`);
    if(pdfBuffer.subarray(0,5).toString()!=='%PDF-') throw badRequest('Uploaded file is not a valid PDF');
    if(!Array.isArray(enteredRows)||enteredRows.length>1000) throw badRequest('enteredRows must contain at most 1000 rows');
    const jobId=randomUUID();
    await pool.execute(`INSERT INTO mark_validation_jobs (id,assessment_id,teacher_user_id,pdf_public_id,original_filename,status,input_pdf,entered_rows_json) VALUES (?,?,?,?,?,'PROCESSING',?,?)`,[jobId,assessmentId,actorUserId,input.pdfPublicId||null,String(fileName).slice(0,255),pdfBuffer,JSON.stringify(enteredRows)]);
    return {jobId,assessmentId,status:'PROCESSING'};
  },
  async getMarkValidation(input) {
    let jobs;
    if (input.jobId) [jobs] = await pool.execute('SELECT * FROM mark_validation_jobs WHERE id=?',[input.jobId]);
    else if (input.assessmentId) [jobs] = await pool.execute(`SELECT * FROM mark_validation_jobs WHERE assessment_id=? AND teacher_user_id=? ORDER BY created_at DESC LIMIT 1`,[input.assessmentId,input.actorUserId]);
    else throw badRequest('jobId or assessmentId is required');
    const job=jobs[0]; if(!job) throw notFound('Validation job not found');
    const actor=await actorRow(input.actorUserId); if(!actor?.is_active || (!actor.is_admin && job.teacher_user_id!==input.actorUserId)) throw forbidden('Cannot view this validation job');
    const [items]=await pool.execute(`SELECT i.*,u.full_name student_name,sp.enrollment_no roll_no FROM mark_validation_items i LEFT JOIN student_profiles sp ON sp.user_id=i.student_user_id LEFT JOIN users u ON u.id=i.student_user_id WHERE i.job_id=? ORDER BY roll_no,i.id`,[job.id]);
    return {job,items};
  },
  async confirmValidatedMarks(input) {
    const {actorUserId,jobId,decisions=[]}=input;
    if(!Array.isArray(decisions)||!decisions.length) throw badRequest('decisions are required');
    return withTransaction(async conn=>{
      const [jobs]=await conn.execute('SELECT * FROM mark_validation_jobs WHERE id=? FOR UPDATE',[jobId]); const job=jobs[0]; if(!job) throw notFound('Validation job not found');
      const {actor,assessment}=await requireTeacherForAssessment(actorUserId,job.assessment_id,conn);
      if(!actor.is_admin&&job.teacher_user_id!==actorUserId) throw forbidden('Only the validating teacher can confirm these marks');
      if(job.status==='PROCESSING') throw badRequest('PDF validation is still processing');
      if(job.status==='FAILED') throw badRequest('PDF validation failed; upload the document again');
      if(job.status==='CONFIRMED') throw badRequest('This validation job has already been confirmed');
      if(assessment.status==='PUBLISHED') throw forbidden('Published marks cannot be changed');
      const [existing]=await conn.execute('SELECT * FROM mark_validation_items WHERE job_id=? FOR UPDATE',[jobId]);
      const byId=new Map(existing.map(x=>[x.id,x]));
      const decisionById=new Map(decisions.map(d=>[d.itemId,d]));
      if(decisionById.size!==existing.length || existing.some(x=>!decisionById.has(x.id))) throw badRequest('Every validation row must be explicitly reviewed');
      const roster=await rosterForAssessment(job.assessment_id,conn); const rosterIds=new Set(roster.map(r=>r.student_user_id));
      await conn.execute('INSERT INTO marks_audit_context (connection_id,actor_user_id) VALUES (CONNECTION_ID(),?) ON DUPLICATE KEY UPDATE actor_user_id=VALUES(actor_user_id)',[actorUserId]);
      let saved=0;
      for(const item of existing){
        const d=decisionById.get(item.id);
        if(d.confirmed!==true) throw badRequest(`Validation row ${item.id} is not confirmed`);
        const studentId=d.studentUserId||item.student_user_id;
        if(!studentId||!rosterIds.has(studentId)) throw badRequest(`Validation row ${item.id} must be mapped to an enrolled student`);
        const finalMarks=Number(d.finalMarks);
        if(!Number.isFinite(finalMarks)||finalMarks<0||finalMarks>Number(assessment.max_marks)) throw badRequest(`Final marks must be between 0 and ${assessment.max_marks}`);
        const requiresReason=(item.extracted_marks===null || Number(item.extracted_marks)!==finalMarks || item.status==='STUDENT_NOT_MATCHED');
        if(requiresReason&&String(d.overrideReason||'').trim().length<5) throw badRequest('A meaningful overrideReason is required when extracted marks differ or require manual review');
        if(item.status==='STUDENT_NOT_MATCHED' && !d.studentUserId) throw badRequest('Unmatched PDF row must be mapped to a student');
        const id=randomUUID();
        await conn.execute(`INSERT INTO marks (id,assessment_id,student_user_id,marks_obtained,entered_by_user_id,updated_by_user_id) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE marks_obtained=VALUES(marks_obtained),updated_by_user_id=VALUES(updated_by_user_id)`,[id,job.assessment_id,studentId,finalMarks,actorUserId,actorUserId]);
        await conn.execute(`UPDATE mark_validation_items SET student_user_id=?,final_marks=?,confirmed=1,override_reason=? WHERE id=?`,[studentId,finalMarks,(d.overrideReason||'').trim()||null,item.id]); saved++;
      }
      await conn.execute(`UPDATE mark_validation_jobs SET status='CONFIRMED',confirmed_at=CURRENT_TIMESTAMP WHERE id=?`,[jobId]);
      await conn.execute('DELETE FROM marks_audit_context WHERE connection_id=CONNECTION_ID()');
      return {jobId,status:'CONFIRMED',saved};
    });
  },
  async __processQueuedValidation(job) {
    const [assessmentRows]=await pool.execute('SELECT max_marks,status FROM assessments WHERE id=?',[job.assessment_id]);
    const assessment=assessmentRows[0]; if(!assessment||assessment.status==='PUBLISHED') throw new Error('Assessment is unavailable for validation');
    const roster=await rosterForAssessment(job.assessment_id); if(!roster.length) throw new Error('No active enrolled students found for this assessment');
    const {text,mode}=await extractPdfText(Buffer.from(job.input_pdf));
    const enteredRows=typeof job.entered_rows_json==='string'?JSON.parse(job.entered_rows_json):job.entered_rows_json||[];
    const submitted=new Map();
    for(const row of enteredRows){
      const key=row.studentUserId||row.studentId||row.rollNumber||row.rollNo;
      if(key) submitted.set(String(key),row);
    }
    const itemRows=[];
    for(const student of roster){
      const entered=submitted.get(student.student_user_id)||submitted.get(student.roll_no);
      const found=findMarksForIdentifier(text,student.roll_no,Number(assessment.max_marks));
      const enteredMarks=entered && entered.marksEntered!==undefined && entered.marksEntered!=='' ? Number(entered.marksEntered) : null;
      let status='MANUAL_REVIEW';
      if(found.ambiguous) status='MANUAL_REVIEW';
      else if(found.marks===null) status='MARKS_NOT_FOUND';
      else if(found.marks<0||found.marks>Number(assessment.max_marks)) status='INVALID_RANGE';
      else if(enteredMarks===null || !Number.isFinite(enteredMarks)) status='MANUAL_REVIEW';
      else if(Math.abs(found.marks-enteredMarks)<0.001) status='MATCH';
      else status='MISMATCH';
      const id=randomUUID();
      await pool.execute(`INSERT INTO mark_validation_items (id,job_id,student_user_id,identifier_from_pdf,entered_marks,extracted_marks,final_marks,page_number,confidence,evidence_text,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[id,job.id,student.student_user_id,student.roll_no,Number.isFinite(enteredMarks)?enteredMarks:null,found.marks,Number.isFinite(enteredMarks)?enteredMarks:null,found.pageNumber,found.confidence,found.evidence||null,status]);
      itemRows.push({id,studentUserId:student.student_user_id,studentName:student.full_name,rollNumber:student.roll_no,enteredMarks:Number.isFinite(enteredMarks)?enteredMarks:null,extractedMarks:found.marks,pageNumber:found.pageNumber,confidence:found.confidence,status,confirmed:false});
    }
    // Extra teacher-entered IDs not found in the roster are visible and must be mapped or removed by review.
    const rosterKeys=new Set(roster.flatMap(r=>[r.student_user_id,r.roll_no]));
    for(const [key,row] of submitted.entries()){
      if(rosterKeys.has(key)) continue;
      const id=randomUUID(); const enteredMarks=Number(row.marksEntered);
      await pool.execute(`INSERT INTO mark_validation_items (id,job_id,student_user_id,identifier_from_pdf,entered_marks,extracted_marks,final_marks,status) VALUES (?,?,NULL,?,?,NULL,?,'STUDENT_NOT_MATCHED')`,[id,job.id,String(row.rollNumber||row.rollNo||key).slice(0,100),Number.isFinite(enteredMarks)?enteredMarks:null,Number.isFinite(enteredMarks)?enteredMarks:null]);
      itemRows.push({id,studentUserId:null,studentName:null,rollNumber:String(row.rollNumber||row.rollNo||key),enteredMarks:Number.isFinite(enteredMarks)?enteredMarks:null,extractedMarks:null,pageNumber:null,confidence:0,status:'STUDENT_NOT_MATCHED',confirmed:false});
    }
    await pool.execute(`UPDATE mark_validation_jobs SET status='NEEDS_REVIEW',extraction_mode=?,error_message=?,input_pdf=NULL,entered_rows_json=NULL,worker_locked_at=NULL,completed_at=UTC_TIMESTAMP() WHERE id=?`,[mode,mode==='FAILED'?'PDF text extraction was unavailable; manual review required':null,job.id]);
    return {total:itemRows.length};
  },
  async publishResults(input) {
    const {actor,assessment}=await requireTeacherForAssessment(input.actorUserId,input.assessmentId);
    if(assessment.status==='PUBLISHED') return {assessmentId:input.assessmentId,status:'PUBLISHED'};
    const [pending]=await pool.execute(`SELECT COUNT(*) AS total FROM mark_validation_jobs WHERE assessment_id=? AND status IN ('PROCESSING','NEEDS_REVIEW')`,[input.assessmentId]);
    if(Number(pending[0].total)>0) throw badRequest('There are pending PDF validation jobs; review them before publishing');
    const [missing]=await pool.execute(`SELECT COUNT(*) AS total FROM class_subjects cs JOIN enrollments e ON e.class_section_id=cs.class_section_id AND e.status='ACTIVE' LEFT JOIN marks m ON m.student_user_id=e.student_user_id AND m.assessment_id=? WHERE cs.id=? AND m.id IS NULL`,[input.assessmentId,assessment.class_subject_id]);
    if(Number(missing[0].total)>0) throw badRequest('Every active enrolled student must have a marks record before publishing');
    await pool.execute(`UPDATE assessments SET status='PUBLISHED' WHERE id=?`,[input.assessmentId]);
    return {assessmentId:input.assessmentId,status:'PUBLISHED'};
  },
  async getStudentResults(input) {
    const actor=await actorRow(input.actorUserId); if(!actor?.is_active) throw forbidden('Active account required');
    const studentId=input.studentUserId||input.actorUserId;
    if(!actor.is_admin&&studentId!==input.actorUserId) throw forbidden('Cannot view another student results');
    const [rows]=await pool.execute(`SELECT a.id assessment_id,a.name assessment_name,a.assessment_type,a.max_marks,a.held_on, s.name subject_name,s.code subject_code,m.marks_obtained,m.updated_at FROM marks m JOIN assessments a ON a.id=m.assessment_id JOIN class_subjects cs ON cs.id=a.class_subject_id JOIN subjects s ON s.id=cs.subject_id WHERE m.student_user_id=? AND a.status='PUBLISHED' ORDER BY a.held_on DESC,a.name`,[studentId]);
    return {items:rows};
  }
};

async function processNextValidationJob() {
  const conn=await pool.getConnection(); let job;
  try {
    await conn.beginTransaction();
    const [jobs]=await conn.query(`SELECT * FROM mark_validation_jobs WHERE status='PROCESSING' AND input_pdf IS NOT NULL AND (worker_locked_at IS NULL OR worker_locked_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 MINUTE)) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`);
    job=jobs[0];
    if(job) await conn.execute(`UPDATE mark_validation_jobs SET attempts=attempts+1,worker_locked_at=UTC_TIMESTAMP() WHERE id=?`,[job.id]);
    await conn.commit();
  } catch(error) { await conn.rollback().catch(()=>{}); throw error; } finally { conn.release(); }
  if(!job) return;
  try {
    await handlers.__processQueuedValidation(job);
    logger.info({jobId:job.id},'Completed marks validation background job');
  } catch(error) {
    const retry=Number(job.attempts)<2;
    await pool.execute(`UPDATE mark_validation_jobs SET status=?,worker_locked_at=NULL,error_message=? WHERE id=?`,[retry?'PROCESSING':'FAILED',String(error.message).slice(0,500),job.id]);
    logger.error({jobId:job.id,err:error.message,retry},'Marks validation background job failed');
  }
}

const { __processQueuedValidation, ...grpcHandlers } = handlers;
startGrpcService({name:'marks-service',serviceName:'marks',address:process.env.MARKS_GRPC_ADDR||'127.0.0.1:50054',Service:erpProto.MarksService,handlers:grpcHandlers});
setInterval(()=>{processNextValidationJob().catch(error=>logger.error({err:error.message},'Marks background worker failed'));},Number(process.env.MARKS_WORKER_POLL_MS||1000)).unref();
processNextValidationJob().catch(error=>logger.warn({err:error.message},'Initial marks background worker poll failed'));
logger.info('Marks service initialized');
