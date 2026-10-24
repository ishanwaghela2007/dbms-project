import { randomUUID } from 'node:crypto';
import cloudinary from 'cloudinary';
import { pool } from '../../shared/db.js';
import { erpProto, startGrpcService } from '../../shared/grpc.js';
import { badRequest, forbidden, notFound } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';

cloudinary.v2.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET,secure:true});
async function actor(id){const [r]=await pool.execute('SELECT id,account_type,is_admin,is_active FROM users WHERE id=?',[id]);return r[0];}
async function assertUploadAccess(input){
  const u=await actor(input.actorUserId); if(!u?.is_active) throw forbidden('Active account required');
  if(u.is_admin) return u;
  if(u.account_type!=='TEACHER') throw forbidden('Only teachers and admins may upload papers');
  if(input.classSubjectId){const [a]=await pool.execute(`SELECT id FROM teaching_assignments WHERE teacher_user_id=? AND class_subject_id=? AND status='ACTIVE'`,[u.id,input.classSubjectId]);if(!a[0])throw forbidden('Teacher is not assigned to this class subject');}
  else {const [a]=await pool.execute(`SELECT cs.id FROM class_subjects cs JOIN subjects s ON s.id=cs.subject_id JOIN teaching_assignments ta ON ta.class_subject_id=cs.id AND ta.status='ACTIVE' WHERE ta.teacher_user_id=? AND s.id=? LIMIT 1`,[u.id,input.subjectId]);if(!a[0])throw forbidden('Teacher is not assigned to this subject');}
  return u;
}
const handlers={
  async createPaper(input){
    await assertUploadAccess(input);
    if(!input.cloudinaryPublicId||!input.subjectId||!input.title||!input.originalFilename) throw badRequest('cloudinaryPublicId, subjectId, title and originalFilename required');
    if(input.mimeType!=='application/pdf') throw badRequest('Only PDF papers are accepted');
    const mediaId=randomUUID(); const paperId=randomUUID();
    await pool.execute(`INSERT INTO media_assets (id,owner_user_id,category,cloudinary_public_id,resource_type,delivery_type,original_filename,mime_type,bytes_size) VALUES (?,?,?,?,?,?,?,?,?)`,[mediaId,input.actorUserId,input.category||'QUESTION_PAPER',input.cloudinaryPublicId,'image','authenticated',input.originalFilename,input.mimeType,Number(input.bytesSize)||0]);
    const visibility=input.visibility||'ENROLLED_STUDENTS'; const status=input.status==='PUBLISHED'&&((await actor(input.actorUserId))?.is_admin)?'PUBLISHED':'DRAFT';
    await pool.execute(`INSERT INTO papers (id,media_asset_id,subject_id,academic_year_id,semester_id,title,paper_type,visibility,status,uploaded_by_user_id,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[paperId,mediaId,input.subjectId,input.academicYearId||null,input.semesterId||null,input.title,input.paperType||'QUESTION_PAPER',visibility,status,input.actorUserId,status==='PUBLISHED'?new Date():null]);
    return {id:paperId,mediaAssetId:mediaId,title:input.title,subjectId:input.subjectId,status,visibility};
  },
  async listPapers(input){
    const u=await actor(input.actorUserId); if(!u?.is_active) throw forbidden('Active account required');
    let where=''; let args=[];
    if(u.is_admin){where=input.status&&input.status!=='ALL'?'WHERE p.status=?':'';args=where?[input.status]:[];}
    else if(u.account_type==='TEACHER'){where='WHERE (p.status=\'PUBLISHED\' OR p.uploaded_by_user_id=?)';args=[u.id]; if(input.subjectId){where+=' AND p.subject_id=?';args.push(input.subjectId);}}
    else if(u.account_type==='STUDENT'){
      where=`WHERE p.status='PUBLISHED' AND (p.visibility='PUBLIC' OR (p.visibility='ENROLLED_STUDENTS' AND EXISTS (
        SELECT 1 FROM enrollments e JOIN class_sections cl ON cl.id=e.class_section_id JOIN class_subjects cs ON cs.class_section_id=cl.id AND cs.subject_id=p.subject_id
        WHERE e.student_user_id=? AND e.status='ACTIVE' AND (p.academic_year_id IS NULL OR cl.academic_year_id=p.academic_year_id)
          AND (p.semester_id IS NULL OR cl.semester_id=p.semester_id)
      )))`;
      args=[u.id];
    } else throw forbidden('Access denied');
    const [rows]=await pool.execute(`SELECT p.id,p.title,p.subject_id,p.academic_year_id,p.semester_id,p.paper_type,p.visibility,p.status,p.created_at,s.name subject_name,s.code subject_code,u.full_name uploaded_by FROM papers p JOIN subjects s ON s.id=p.subject_id JOIN users u ON u.id=p.uploaded_by_user_id ${where} ORDER BY p.created_at DESC LIMIT 200`,args);
    return {items:rows};
  },
  async getPaperAccess(input){
    const [rows]=await pool.execute(`SELECT p.*,ma.cloudinary_public_id,ma.resource_type,ma.delivery_type,ma.mime_type FROM papers p JOIN media_assets ma ON ma.id=p.media_asset_id WHERE p.id=?`,[input.paperId]);
    const p=rows[0]; if(!p) throw notFound('Paper not found'); const u=await actor(input.actorUserId); if(!u?.is_active) throw forbidden('Active account required');
    if(!u.is_admin){
      if(p.status!=='PUBLISHED'&&p.uploaded_by_user_id!==u.id) throw forbidden('Paper is not published');
      if(u.account_type==='STUDENT'&&p.visibility!=='PUBLIC'){
        const [e]=await pool.execute(`SELECT e.id FROM enrollments e JOIN class_sections cl ON cl.id=e.class_section_id JOIN class_subjects cs ON cs.class_section_id=cl.id AND cs.subject_id=? WHERE e.student_user_id=? AND e.status='ACTIVE' AND (? IS NULL OR cl.academic_year_id=?) AND (? IS NULL OR cl.semester_id=?) LIMIT 1`,[p.subject_id,u.id,p.academic_year_id,p.academic_year_id,p.semester_id,p.semester_id]);
        if(!e[0]) throw forbidden('You are not enrolled in the relevant class');
      }
      if(p.visibility==='FACULTY_ONLY'&&u.account_type!=='TEACHER') throw forbidden('Faculty-only paper');
    }
    if (p.cloudinary_public_id?.startsWith('local:')) {
      const rel = p.cloudinary_public_id.replace(/^local:/, '');
      const url = `http://localhost:4000/api/v1/uploads/${rel}`;
      return { id: p.id, url, expiresInSeconds: 3600, mimeType: p.mime_type, title: p.title };
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_SECRET) {
      const url = `http://localhost:4000/api/v1/uploads/${p.cloudinary_public_id}`;
      return { id: p.id, url, expiresInSeconds: 3600, mimeType: p.mime_type, title: p.title };
    }
    const url=cloudinary.v2.url(p.cloudinary_public_id,{resource_type:p.resource_type||'image',type:p.delivery_type||'authenticated',sign_url:true,secure:true,format:'pdf'});
    return {id:p.id,url,expiresInSeconds:300,mimeType:p.mime_type,title:p.title};
  },
  async updatePaper(input){
    const u=await actor(input.actorUserId); if(!u?.is_active) throw forbidden('Active account required');
    const [owners]=await pool.execute('SELECT uploaded_by_user_id FROM papers WHERE id=?',[input.paperId]);
    if(!owners[0]) throw notFound('Paper not found');
    if(!u.is_admin&&owners[0].uploaded_by_user_id!==u.id) throw forbidden('Admin or paper owner access required');
    const fields=[];const args=[]; if(input.title){fields.push('title=?');args.push(input.title);} if(input.visibility){fields.push('visibility=?');args.push(input.visibility);} if(input.status){if(!['DRAFT','PUBLISHED','ARCHIVED'].includes(input.status))throw badRequest('Invalid paper status');if(input.status==='PUBLISHED'&&!u.is_admin)throw forbidden('Only an admin may publish papers');fields.push('status=?');args.push(input.status);if(input.status==='PUBLISHED')fields.push('published_at=UTC_TIMESTAMP()');}
    if(!fields.length) throw badRequest('No paper fields to update'); args.push(input.paperId); const [r]=await pool.execute(`UPDATE papers SET ${fields.join(',')} WHERE id=?`,args); if(!r.affectedRows) throw notFound('Paper not found'); return {id:input.paperId,updated:true};
  },
  async updateProfileAsset(input){
    const u=await actor(input.actorUserId); if(!u?.is_active||(!u.is_admin&&u.id!==input.userId)) throw forbidden('Cannot update another user profile picture');
    if(!input.cloudinaryPublicId) throw badRequest('cloudinaryPublicId required');
    const [target]=await pool.execute('SELECT account_type FROM users WHERE id=?',[input.userId]);if(!target[0])throw notFound('User not found');
    const mediaId=randomUUID(); await pool.execute(`INSERT INTO media_assets (id,owner_user_id,category,cloudinary_public_id,resource_type,delivery_type,original_filename,mime_type,bytes_size) VALUES (?,?, 'PROFILE_IMAGE',?,'image','upload',?,'image/jpeg',?)`,[mediaId,input.userId,input.cloudinaryPublicId,input.originalFilename||'avatar.jpg',Number(input.bytesSize)||0]);
    await pool.execute('UPDATE users SET avatar_public_id=? WHERE id=?', [input.cloudinaryPublicId, input.userId]);
    if (target[0].account_type === 'STUDENT') {
      await pool.execute('UPDATE student_profiles SET avatar_public_id=? WHERE user_id=?', [input.cloudinaryPublicId, input.userId]).catch(() => {});
    } else if (target[0].account_type === 'TEACHER') {
      await pool.execute('UPDATE faculty_profiles SET avatar_public_id=? WHERE user_id=?', [input.cloudinaryPublicId, input.userId]).catch(() => {});
    }
    return { mediaAssetId: mediaId, userId: input.userId, cloudinaryPublicId: input.cloudinaryPublicId };
  }
};
startGrpcService({name:'paper-media-service',serviceName:'paper',address:process.env.PAPER_GRPC_ADDR||'127.0.0.1:50056',Service:erpProto.PaperService,handlers});
logger.info('Paper & Media service initialized');
