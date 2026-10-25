import { randomUUID } from 'node:crypto';
import { badRequest, notFound } from '../../shared/errors.js';

/**
 * Validates marks value against assessment rules.
 * Enforces:
 * - Marks cannot be NULL or empty
 * - Marks must be a finite number >= 0
 * - Assessment max_marks cannot be NULL
 * - Marks cannot exceed max_marks
 */
export function validateMarks(marksObtained, maxMarks) {
  if (marksObtained === null || marksObtained === undefined || marksObtained === '') {
    throw badRequest('Marks obtained is required and cannot be null');
  }
  const marks = Number(marksObtained);
  if (!Number.isFinite(marks)) {
    throw badRequest('Marks must be a valid number');
  }
  if (marks < 0) {
    throw badRequest('Marks must be between zero and maximum marks');
  }
  if (maxMarks === null || maxMarks === undefined) {
    throw badRequest('Assessment maximum marks is not defined');
  }
  const max = Number(maxMarks);
  if (!Number.isFinite(max) || marks > max) {
    throw badRequest('Marks must be between zero and maximum marks');
  }
  return marks;
}

/**
 * Inserts or updates a marks record with transactional validation and audit logging.
 * Replaces MySQL triggers: trg_marks_before_insert, trg_marks_before_update, trg_marks_after_insert, trg_marks_after_update.
 *
 * @param {import('mysql2/promise').Connection} conn Active database connection within transaction
 * @param {Object} params
 * @param {string} params.assessmentId
 * @param {string} [params.studentUserId]
 * @param {number|string} params.marksObtained
 * @param {string} params.actorUserId
 * @param {string} [params.markId]
 */
export async function recordMarkWithAudit(conn, {
  assessmentId,
  studentUserId,
  marksObtained,
  actorUserId,
  markId = null,
}) {
  if (!assessmentId) throw badRequest('assessmentId is required');
  if (!actorUserId) throw badRequest('actorUserId is required from authenticated context');

  // Verify assessment exists and fetch max_marks with row lock
  const [assessments] = await conn.execute(
    'SELECT id, max_marks, status FROM assessments WHERE id = ? FOR UPDATE',
    [assessmentId]
  );
  const assessment = assessments[0];
  if (!assessment || assessment.max_marks === null) {
    throw notFound('Assessment not found');
  }

  // Validate marks range against assessment.max_marks
  const validMarks = validateMarks(marksObtained, assessment.max_marks);

  // Check if mark record already exists
  let existing = null;
  if (markId) {
    const [rows] = await conn.execute(
      'SELECT id, assessment_id, student_user_id, marks_obtained FROM marks WHERE id = ? FOR UPDATE',
      [markId]
    );
    existing = rows[0] || null;
  }
  if (!existing && studentUserId) {
    const [rows] = await conn.execute(
      'SELECT id, assessment_id, student_user_id, marks_obtained FROM marks WHERE assessment_id = ? AND student_user_id = ? FOR UPDATE',
      [assessmentId, studentUserId]
    );
    existing = rows[0] || null;
  }

  if (!existing) {
    // INSERT operation
    if (!studentUserId) throw badRequest('studentUserId is required for new marks entry');
    const newId = markId || randomUUID();
    await conn.execute(
      `INSERT INTO marks (id, assessment_id, student_user_id, marks_obtained, entered_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId, assessmentId, studentUserId, validMarks, actorUserId, actorUserId]
    );

    // Audit log for INSERT (old_marks = NULL)
    await conn.execute(
      `INSERT INTO marks_audit_logs (mark_id, assessment_id, student_user_id, action, old_marks, new_marks, changed_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId, assessmentId, studentUserId, 'INSERT', null, validMarks, actorUserId]
    );

    return {
      markId: newId,
      action: 'INSERT',
      oldMarks: null,
      newMarks: validMarks,
      audited: true,
    };
  }

  // UPDATE operation
  const targetMarkId = existing.id;
  const targetStudentId = existing.student_user_id;
  const oldMarks = Number(existing.marks_obtained);
  const marksChanged = Math.abs(oldMarks - validMarks) > 0.0001;
  const assessmentChanged = existing.assessment_id !== assessmentId;

  if (marksChanged || assessmentChanged) {
    await conn.execute(
      `UPDATE marks SET assessment_id = ?, marks_obtained = ?, updated_by_user_id = ? WHERE id = ?`,
      [assessmentId, validMarks, actorUserId, targetMarkId]
    );

    // Audit log for UPDATE (only when marks or assessment changed)
    await conn.execute(
      `INSERT INTO marks_audit_logs (mark_id, assessment_id, student_user_id, action, old_marks, new_marks, changed_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [targetMarkId, assessmentId, targetStudentId, 'UPDATE', oldMarks, validMarks, actorUserId]
    );

    return {
      markId: targetMarkId,
      action: 'UPDATE',
      oldMarks,
      newMarks: validMarks,
      audited: true,
    };
  }

  // Value unchanged: update updated_by_user_id without creating redundant audit record
  await conn.execute(
    `UPDATE marks SET updated_by_user_id = ? WHERE id = ?`,
    [actorUserId, targetMarkId]
  );

  return {
    markId: targetMarkId,
    action: 'UPDATE',
    oldMarks,
    newMarks: validMarks,
    audited: false,
  };
}

/**
 * Deletes a marks record with transactional audit logging.
 * Replaces MySQL trigger: trg_marks_after_delete.
 *
 * @param {import('mysql2/promise').Connection} conn Active database connection within transaction
 * @param {Object} params
 * @param {string} params.markId
 * @param {string} params.actorUserId
 */
export async function deleteMarkWithAudit(conn, { markId, actorUserId }) {
  if (!markId) throw badRequest('markId is required');
  if (!actorUserId) throw badRequest('actorUserId is required from authenticated context');

  const [rows] = await conn.execute(
    'SELECT id, assessment_id, student_user_id, marks_obtained FROM marks WHERE id = ? FOR UPDATE',
    [markId]
  );
  const existing = rows[0];
  if (!existing) {
    throw notFound('Marks record not found');
  }

  // Delete from marks table
  await conn.execute('DELETE FROM marks WHERE id = ?', [markId]);

  // Insert audit record for DELETE (new_marks = NULL, survives marks row deletion)
  await conn.execute(
    `INSERT INTO marks_audit_logs (mark_id, assessment_id, student_user_id, action, old_marks, new_marks, changed_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [existing.id, existing.assessment_id, existing.student_user_id, 'DELETE', Number(existing.marks_obtained), null, actorUserId]
  );

  return {
    markId: existing.id,
    action: 'DELETE',
    oldMarks: Number(existing.marks_obtained),
    newMarks: null,
    audited: true,
  };
}
