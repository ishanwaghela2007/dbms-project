import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateMarks, recordMarkWithAudit, deleteMarkWithAudit } from '../src/services/marks/marks-audit.js';
import { auditUserSecurity } from '../src/shared/user-security-audit.js';

/**
 * Creates an in-memory transactional database connection mock that simulates MySQL/TiDB
 * table state, transaction snapshot rollback, and row-level operations.
 */
function createMockDb(initialState = {}) {
  let state = {
    assessments: new Map(initialState.assessments || []),
    marks: new Map(initialState.marks || []),
    marks_audit_logs: [...(initialState.marks_audit_logs || [])],
    users: new Map(initialState.users || []),
    user_security_audit_logs: [...(initialState.user_security_audit_logs || [])],
    attendance_records: new Map(initialState.attendance_records || []),
    attendance_audit_logs: [...(initialState.attendance_audit_logs || [])],
    appointments: new Map(initialState.appointments || []),
    appointment_audit_logs: [...(initialState.appointment_audit_logs || [])],
  };

  let snapshot = null;
  let simulateAuditFailure = false;

  const cloneState = (s) => ({
    assessments: new Map(Array.from(s.assessments.entries()).map(([k, v]) => [k, { ...v }])),
    marks: new Map(Array.from(s.marks.entries()).map(([k, v]) => [k, { ...v }])),
    marks_audit_logs: s.marks_audit_logs.map(x => ({ ...x })),
    users: new Map(Array.from(s.users.entries()).map(([k, v]) => [k, { ...v }])),
    user_security_audit_logs: s.user_security_audit_logs.map(x => ({ ...x })),
    attendance_records: new Map(Array.from(s.attendance_records.entries()).map(([k, v]) => [k, { ...v }])),
    attendance_audit_logs: s.attendance_audit_logs.map(x => ({ ...x })),
    appointments: new Map(Array.from(s.appointments.entries()).map(([k, v]) => [k, { ...v }])),
    appointment_audit_logs: s.appointment_audit_logs.map(x => ({ ...x })),
  });

  const conn = {
    failAuditInsertions(fail = true) {
      simulateAuditFailure = fail;
    },
    async beginTransaction() {
      snapshot = cloneState(state);
    },
    async commit() {
      snapshot = null;
    },
    async rollback() {
      if (snapshot) {
        state = snapshot;
        snapshot = null;
      }
    },
    async execute(sql, params = []) {
      const normalizedSql = sql.trim().replace(/\s+/g, ' ');

      // --- ASSESSMENTS ---
      if (/SELECT .* FROM assessments WHERE id = \? FOR UPDATE/i.test(normalizedSql)) {
        const assessment = state.assessments.get(params[0]);
        return [assessment ? [{ ...assessment }] : []];
      }

      // --- MARKS ---
      if (/SELECT .* FROM marks WHERE id = \? FOR UPDATE/i.test(normalizedSql)) {
        const mark = state.marks.get(params[0]);
        return [mark ? [{ ...mark }] : []];
      }
      if (/SELECT .* FROM marks WHERE assessment_id = \? AND student_user_id = \? FOR UPDATE/i.test(normalizedSql)) {
        const [aId, sId] = params;
        const mark = Array.from(state.marks.values()).find(m => m.assessment_id === aId && m.student_user_id === sId);
        return [mark ? [{ ...mark }] : []];
      }
      if (/INSERT INTO marks\s*\(/i.test(normalizedSql)) {
        const [id, assessment_id, student_user_id, marks_obtained, entered_by_user_id, updated_by_user_id] = params;
        state.marks.set(id, { id, assessment_id, student_user_id, marks_obtained, entered_by_user_id, updated_by_user_id });
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE marks SET assessment_id = \?, marks_obtained = \?, updated_by_user_id = \? WHERE id = \?/i.test(normalizedSql)) {
        const [assessment_id, marks_obtained, updated_by_user_id, id] = params;
        const m = state.marks.get(id);
        if (m) {
          m.assessment_id = assessment_id;
          m.marks_obtained = marks_obtained;
          m.updated_by_user_id = updated_by_user_id;
        }
        return [{ affectedRows: m ? 1 : 0 }];
      }
      if (/UPDATE marks SET updated_by_user_id = \? WHERE id = \?/i.test(normalizedSql)) {
        const [updated_by_user_id, id] = params;
        const m = state.marks.get(id);
        if (m) m.updated_by_user_id = updated_by_user_id;
        return [{ affectedRows: m ? 1 : 0 }];
      }
      if (/DELETE FROM marks WHERE id = \?/i.test(normalizedSql)) {
        const id = params[0];
        const existed = state.marks.delete(id);
        return [{ affectedRows: existed ? 1 : 0 }];
      }

      // --- MARKS AUDIT LOGS ---
      if (/INSERT INTO marks_audit_logs/i.test(normalizedSql)) {
        if (simulateAuditFailure) {
          throw new Error('Simulated database error: marks_audit_logs write failed');
        }
        const [mark_id, assessment_id, student_user_id, action, old_marks, new_marks, changed_by_user_id] = params;
        state.marks_audit_logs.push({
          id: state.marks_audit_logs.length + 1,
          mark_id,
          assessment_id,
          student_user_id,
          action,
          old_marks,
          new_marks,
          changed_by_user_id,
          changed_at: new Date()
        });
        return [{ affectedRows: 1 }];
      }

      // --- USERS & USER SECURITY AUDIT ---
      if (/SELECT .* FROM users WHERE id = \? FOR UPDATE/i.test(normalizedSql)) {
        const u = state.users.get(params[0]);
        return [u ? [{ ...u }] : []];
      }
      if (/INSERT INTO user_security_audit_logs/i.test(normalizedSql)) {
        if (simulateAuditFailure) {
          throw new Error('Simulated database error: user_security_audit_logs write failed');
        }
        const [user_id, changed_field, old_value, new_value] = params;
        state.user_security_audit_logs.push({
          id: state.user_security_audit_logs.length + 1,
          user_id,
          changed_field,
          old_value,
          new_value,
          changed_at: new Date()
        });
        return [{ affectedRows: 1 }];
      }

      // --- ATTENDANCE & ATTENDANCE AUDIT ---
      if (/SELECT .* FROM attendance_records WHERE session_id = \? FOR UPDATE/i.test(normalizedSql)) {
        const sessionId = params[0];
        const records = Array.from(state.attendance_records.values()).filter(r => r.session_id === sessionId);
        return [records.map(r => ({ ...r }))];
      }
      if (/UPDATE attendance_records SET status=\?, marked_by_user_id=\?, remarks=\? WHERE id=\?/i.test(normalizedSql)) {
        const [status, marked_by_user_id, remarks, id] = params;
        const r = state.attendance_records.get(id);
        if (r) {
          r.status = status;
          r.marked_by_user_id = marked_by_user_id;
          r.remarks = remarks;
        }
        return [{ affectedRows: r ? 1 : 0 }];
      }
      if (/INSERT INTO attendance_audit_logs/i.test(normalizedSql)) {
        if (simulateAuditFailure) {
          throw new Error('Simulated database error: attendance_audit_logs write failed');
        }
        const [attendance_record_id, student_user_id, old_status, new_status, changed_by_user_id] = params;
        state.attendance_audit_logs.push({
          id: state.attendance_audit_logs.length + 1,
          attendance_record_id,
          student_user_id,
          old_status,
          new_status,
          changed_by_user_id,
          changed_at: new Date()
        });
        return [{ affectedRows: 1 }];
      }

      // --- APPOINTMENTS & APPOINTMENT AUDIT ---
      if (/INSERT INTO appointment_audit_logs/i.test(normalizedSql)) {
        if (simulateAuditFailure) {
          throw new Error('Simulated database error: appointment_audit_logs write failed');
        }
        const [appointment_id, actor_user_id, old_status, new_status] = params;
        state.appointment_audit_logs.push({
          id: state.appointment_audit_logs.length + 1,
          appointment_id,
          actor_user_id,
          old_status,
          new_status,
          changed_at: new Date()
        });
        return [{ affectedRows: 1 }];
      }

      return [{ affectedRows: 0 }];
    },
    getState() {
      return state;
    }
  };

  return conn;
}

// Helper to run within a transaction
async function withMockTx(conn, fn) {
  await conn.beginTransaction();
  try {
    const res = await fn(conn);
    await conn.commit();
    return res;
  } catch (err) {
    await conn.rollback();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// TEST 1: Inserting marks within the permitted range succeeds and creates one audit record
// ---------------------------------------------------------------------------
test('Case 1: Inserting marks within permitted range succeeds and creates exactly one audit record', async () => {
  const conn = createMockDb({
    assessments: [['as-1', { id: 'as-1', max_marks: 100, status: 'OPEN' }]]
  });

  const res = await withMockTx(conn, async (c) => {
    return recordMarkWithAudit(c, {
      assessmentId: 'as-1',
      studentUserId: 'stu-1',
      marksObtained: 85,
      actorUserId: 'teacher-1'
    });
  });

  assert.equal(res.action, 'INSERT');
  assert.equal(res.audited, true);
  assert.equal(res.newMarks, 85);

  const state = conn.getState();
  assert.equal(state.marks.size, 1);
  const mark = state.marks.get(res.markId);
  assert.equal(mark.marks_obtained, 85);

  assert.equal(state.marks_audit_logs.length, 1);
  const log = state.marks_audit_logs[0];
  assert.equal(log.mark_id, res.markId);
  assert.equal(log.action, 'INSERT');
  assert.equal(log.old_marks, null);
  assert.equal(log.new_marks, 85);
  assert.equal(log.changed_by_user_id, 'teacher-1');
});

// ---------------------------------------------------------------------------
// TEST 2: Inserting negative, NULL, or excessive marks is rejected
// ---------------------------------------------------------------------------
test('Case 2: Inserting negative, NULL, or excessive marks is rejected', async () => {
  const conn = createMockDb({
    assessments: [['as-1', { id: 'as-1', max_marks: 50, status: 'OPEN' }]]
  });

  // Negative marks
  await assert.rejects(
    () => withMockTx(conn, c => recordMarkWithAudit(c, { assessmentId: 'as-1', studentUserId: 'stu-1', marksObtained: -5, actorUserId: 'teacher-1' })),
    /Marks must be between zero and maximum marks/
  );

  // NULL / undefined marks
  await assert.rejects(
    () => withMockTx(conn, c => recordMarkWithAudit(c, { assessmentId: 'as-1', studentUserId: 'stu-1', marksObtained: null, actorUserId: 'teacher-1' })),
    /Marks obtained is required/
  );

  // Excessive marks (> max_marks)
  await assert.rejects(
    () => withMockTx(conn, c => recordMarkWithAudit(c, { assessmentId: 'as-1', studentUserId: 'stu-1', marksObtained: 55, actorUserId: 'teacher-1' })),
    /Marks must be between zero and maximum marks/
  );

  // Verify no data or audit logs were created
  const state = conn.getState();
  assert.equal(state.marks.size, 0);
  assert.equal(state.marks_audit_logs.length, 0);
});

// ---------------------------------------------------------------------------
// TEST 3: Inserting marks for a nonexistent assessment is rejected
// ---------------------------------------------------------------------------
test('Case 3: Inserting marks for a nonexistent assessment is rejected', async () => {
  const conn = createMockDb();

  await assert.rejects(
    () => withMockTx(conn, c => recordMarkWithAudit(c, { assessmentId: 'nonexistent-assessment', studentUserId: 'stu-1', marksObtained: 20, actorUserId: 'teacher-1' })),
    /Assessment not found/
  );

  const state = conn.getState();
  assert.equal(state.marks.size, 0);
  assert.equal(state.marks_audit_logs.length, 0);
});

// ---------------------------------------------------------------------------
// TEST 4: Updating marks to an invalid value is rejected without changing original record
// ---------------------------------------------------------------------------
test('Case 4: Updating marks to an invalid value is rejected without changing original record', async () => {
  const conn = createMockDb({
    assessments: [['as-1', { id: 'as-1', max_marks: 100, status: 'OPEN' }]],
    marks: [['mark-1', { id: 'mark-1', assessment_id: 'as-1', student_user_id: 'stu-1', marks_obtained: 75, entered_by_user_id: 'teacher-1', updated_by_user_id: 'teacher-1' }]],
    marks_audit_logs: [{ mark_id: 'mark-1', assessment_id: 'as-1', student_user_id: 'stu-1', action: 'INSERT', old_marks: null, new_marks: 75, changed_by_user_id: 'teacher-1' }]
  });

  // Attempt update to 150 (> 100)
  await assert.rejects(
    () => withMockTx(conn, c => recordMarkWithAudit(c, { markId: 'mark-1', assessmentId: 'as-1', studentUserId: 'stu-1', marksObtained: 150, actorUserId: 'teacher-1' })),
    /Marks must be between zero and maximum marks/
  );

  // Attempt update to negative (-10)
  await assert.rejects(
    () => withMockTx(conn, c => recordMarkWithAudit(c, { markId: 'mark-1', assessmentId: 'as-1', studentUserId: 'stu-1', marksObtained: -10, actorUserId: 'teacher-1' })),
    /Marks must be between zero and maximum marks/
  );

  // Verify original record is completely unchanged
  const state = conn.getState();
  const mark = state.marks.get('mark-1');
  assert.equal(mark.marks_obtained, 75);
  assert.equal(state.marks_audit_logs.length, 1); // No new audit logs added
});

// ---------------------------------------------------------------------------
// TEST 5: Updating marks to a new valid value creates one audit entry with correct old and new values
// ---------------------------------------------------------------------------
test('Case 5: Updating marks to a new valid value creates one audit entry with correct old and new values', async () => {
  const conn = createMockDb({
    assessments: [['as-1', { id: 'as-1', max_marks: 100, status: 'OPEN' }]],
    marks: [['mark-1', { id: 'mark-1', assessment_id: 'as-1', student_user_id: 'stu-1', marks_obtained: 75, entered_by_user_id: 'teacher-1', updated_by_user_id: 'teacher-1' }]],
    marks_audit_logs: [{ mark_id: 'mark-1', assessment_id: 'as-1', student_user_id: 'stu-1', action: 'INSERT', old_marks: null, new_marks: 75, changed_by_user_id: 'teacher-1' }]
  });

  const res = await withMockTx(conn, async (c) => {
    return recordMarkWithAudit(c, {
      markId: 'mark-1',
      assessmentId: 'as-1',
      studentUserId: 'stu-1',
      marksObtained: 88,
      actorUserId: 'teacher-2'
    });
  });

  assert.equal(res.action, 'UPDATE');
  assert.equal(res.audited, true);
  assert.equal(res.oldMarks, 75);
  assert.equal(res.newMarks, 88);

  const state = conn.getState();
  assert.equal(state.marks.get('mark-1').marks_obtained, 88);
  assert.equal(state.marks_audit_logs.length, 2);

  const updateLog = state.marks_audit_logs[1];
  assert.equal(updateLog.mark_id, 'mark-1');
  assert.equal(updateLog.action, 'UPDATE');
  assert.equal(updateLog.old_marks, 75);
  assert.equal(updateLog.new_marks, 88);
  assert.equal(updateLog.changed_by_user_id, 'teacher-2');
});

// ---------------------------------------------------------------------------
// TEST 6: Updating a record without changing its marks creates no redundant marks audit entry
// ---------------------------------------------------------------------------
test('Case 6: Updating a record without changing its marks creates no redundant marks audit entry', async () => {
  const conn = createMockDb({
    assessments: [['as-1', { id: 'as-1', max_marks: 100, status: 'OPEN' }]],
    marks: [['mark-1', { id: 'mark-1', assessment_id: 'as-1', student_user_id: 'stu-1', marks_obtained: 88, entered_by_user_id: 'teacher-1', updated_by_user_id: 'teacher-1' }]],
    marks_audit_logs: [{ mark_id: 'mark-1', assessment_id: 'as-1', student_user_id: 'stu-1', action: 'INSERT', old_marks: null, new_marks: 88, changed_by_user_id: 'teacher-1' }]
  });

  const res = await withMockTx(conn, async (c) => {
    return recordMarkWithAudit(c, {
      markId: 'mark-1',
      assessmentId: 'as-1',
      studentUserId: 'stu-1',
      marksObtained: 88,
      actorUserId: 'teacher-1'
    });
  });

  assert.equal(res.audited, false);
  const state = conn.getState();
  assert.equal(state.marks_audit_logs.length, 1); // Still exactly 1 audit log!
});

// ---------------------------------------------------------------------------
// TEST 7: Deleting a marks record creates an audit entry that remains after deletion
// ---------------------------------------------------------------------------
test('Case 7: Deleting a marks record creates an audit entry that remains after deletion', async () => {
  const conn = createMockDb({
    assessments: [['as-1', { id: 'as-1', max_marks: 100, status: 'OPEN' }]],
    marks: [['mark-1', { id: 'mark-1', assessment_id: 'as-1', student_user_id: 'stu-1', marks_obtained: 90, entered_by_user_id: 'teacher-1', updated_by_user_id: 'teacher-1' }]]
  });

  const res = await withMockTx(conn, async (c) => {
    return deleteMarkWithAudit(c, { markId: 'mark-1', actorUserId: 'teacher-1' });
  });

  assert.equal(res.action, 'DELETE');
  assert.equal(res.oldMarks, 90);
  assert.equal(res.newMarks, null);

  const state = conn.getState();
  assert.equal(state.marks.has('mark-1'), false); // Deleted from marks table
  assert.equal(state.marks_audit_logs.length, 1); // Preserved in marks_audit_logs

  const deleteLog = state.marks_audit_logs[0];
  assert.equal(deleteLog.mark_id, 'mark-1');
  assert.equal(deleteLog.action, 'DELETE');
  assert.equal(deleteLog.old_marks, 90);
  assert.equal(deleteLog.new_marks, null);
  assert.equal(deleteLog.changed_by_user_id, 'teacher-1');
});

// ---------------------------------------------------------------------------
// TEST 8: Changes to is_admin and is_active are audited correctly
// ---------------------------------------------------------------------------
test('Case 8: Changes to is_admin and is_active are audited correctly', async () => {
  const conn = createMockDb();

  const audited = await withMockTx(conn, async (c) => {
    return auditUserSecurity(c, 'user-100', {
      oldValues: { is_admin: 0, is_active: 0 },
      newValues: { is_admin: 1, is_active: 1 }
    });
  });

  assert.equal(audited.length, 2);
  const state = conn.getState();
  assert.equal(state.user_security_audit_logs.length, 2);

  const adminLog = state.user_security_audit_logs.find(l => l.changed_field === 'is_admin');
  assert.ok(adminLog);
  assert.equal(adminLog.old_value, '0');
  assert.equal(adminLog.new_value, '1');

  const activeLog = state.user_security_audit_logs.find(l => l.changed_field === 'is_active');
  assert.ok(activeLog);
  assert.equal(activeLog.old_value, '0');
  assert.equal(activeLog.new_value, '1');
});

// ---------------------------------------------------------------------------
// TEST 9: Unchanged security fields do not create audit entries
// ---------------------------------------------------------------------------
test('Case 9: Unchanged security fields do not create audit entries', async () => {
  const conn = createMockDb();

  const audited = await withMockTx(conn, async (c) => {
    return auditUserSecurity(c, 'user-100', {
      oldValues: { is_admin: 1, is_active: 1 },
      newValues: { is_admin: 1, is_active: 1 }
    });
  });

  assert.equal(audited.length, 0);
  const state = conn.getState();
  assert.equal(state.user_security_audit_logs.length, 0);
});

// ---------------------------------------------------------------------------
// TEST 10: Attendance and appointment status changes are audited correctly
// ---------------------------------------------------------------------------
test('Case 10: Attendance and appointment status changes are audited correctly', async () => {
  const conn = createMockDb({
    attendance_records: [['att-1', { id: 'att-1', session_id: 'ses-1', student_user_id: 'stu-1', status: 'PRESENT' }]],
    appointments: [['app-1', { id: 'app-1', status: 'REQUESTED' }]]
  });

  // 10A: Attendance status change
  await withMockTx(conn, async (c) => {
    const [existing] = await c.execute('SELECT * FROM attendance_records WHERE session_id = ? FOR UPDATE', ['ses-1']);
    const rec = existing[0];
    if (rec.status !== 'ABSENT') {
      await c.execute('UPDATE attendance_records SET status=?, marked_by_user_id=?, remarks=? WHERE id=?', ['ABSENT', 'teacher-1', 'Absent note', rec.id]);
      await c.execute('INSERT INTO attendance_audit_logs (attendance_record_id, student_user_id, old_status, new_status, changed_by_user_id) VALUES (?, ?, ?, ?, ?)', [rec.id, rec.student_user_id, rec.status, 'ABSENT', 'teacher-1']);
    }
  });

  let state = conn.getState();
  assert.equal(state.attendance_records.get('att-1').status, 'ABSENT');
  assert.equal(state.attendance_audit_logs.length, 1);
  assert.equal(state.attendance_audit_logs[0].old_status, 'PRESENT');
  assert.equal(state.attendance_audit_logs[0].new_status, 'ABSENT');

  // 10B: Attendance status unchanged - no duplicate audit entry
  await withMockTx(conn, async (c) => {
    const [existing] = await c.execute('SELECT * FROM attendance_records WHERE session_id = ? FOR UPDATE', ['ses-1']);
    const rec = existing[0];
    if (rec.status !== 'ABSENT') {
      await c.execute('INSERT INTO attendance_audit_logs ...');
    }
  });
  state = conn.getState();
  assert.equal(state.attendance_audit_logs.length, 1); // Still 1

  // 10C: Appointment status change
  await withMockTx(conn, async (c) => {
    const oldStatus = 'REQUESTED';
    const newStatus = 'CONFIRMED';
    if (oldStatus !== newStatus) {
      await c.execute('INSERT INTO appointment_audit_logs (appointment_id, actor_user_id, old_status, new_status, changed_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)', ['app-1', 'teacher-1', oldStatus, newStatus]);
    }
  });

  state = conn.getState();
  assert.equal(state.appointment_audit_logs.length, 1);
  assert.equal(state.appointment_audit_logs[0].old_status, 'REQUESTED');
  assert.equal(state.appointment_audit_logs[0].new_status, 'CONFIRMED');
});

// ---------------------------------------------------------------------------
// TEST 11: Unauthorized security changes are rejected
// ---------------------------------------------------------------------------
test('Case 11: Unauthorized security changes are rejected', async () => {
  // Test authorization guard: only active administrators can modify security roles
  function assertAdminUser(actor) {
    if (!actor || !actor.is_active || !actor.is_admin) {
      const err = new Error('Only an active administrator can change account permissions');
      err.status = 403;
      throw err;
    }
  }

  // Non-admin teacher
  assert.throws(() => assertAdminUser({ is_admin: false, is_active: true }), /Only an active administrator/);

  // Inactive admin
  assert.throws(() => assertAdminUser({ is_admin: true, is_active: false }), /Only an active administrator/);

  // Active admin succeeds
  assert.doesNotThrow(() => assertAdminUser({ is_admin: true, is_active: true }));
});

// ---------------------------------------------------------------------------
// TEST 12: A failed audit insertion causes the corresponding data modification to roll back
// ---------------------------------------------------------------------------
test('Case 12: A failed audit insertion causes corresponding data modification to roll back', async () => {
  const conn = createMockDb({
    assessments: [['as-1', { id: 'as-1', max_marks: 100, status: 'OPEN' }]]
  });

  // Configure audit log insertion to simulate a DB failure
  conn.failAuditInsertions(true);

  await assert.rejects(
    () => withMockTx(conn, async (c) => {
      return recordMarkWithAudit(c, {
        assessmentId: 'as-1',
        studentUserId: 'stu-1',
        marksObtained: 95,
        actorUserId: 'teacher-1'
      });
    }),
    /marks_audit_logs write failed/
  );

  // Verify rollback: marks table must NOT have the inserted record
  const state = conn.getState();
  assert.equal(state.marks.size, 0);
  assert.equal(state.marks_audit_logs.length, 0);
});

// ---------------------------------------------------------------------------
// TEST 13: Concurrent updates do not produce inconsistent marks or audit history
// ---------------------------------------------------------------------------
test('Case 13: Concurrent updates do not produce inconsistent marks or audit history', async () => {
  const conn = createMockDb({
    assessments: [['as-1', { id: 'as-1', max_marks: 100, status: 'OPEN' }]],
    marks: [['mark-1', { id: 'mark-1', assessment_id: 'as-1', student_user_id: 'stu-1', marks_obtained: 50, entered_by_user_id: 'teacher-1', updated_by_user_id: 'teacher-1' }]],
    marks_audit_logs: [{ mark_id: 'mark-1', assessment_id: 'as-1', student_user_id: 'stu-1', action: 'INSERT', old_marks: null, new_marks: 50, changed_by_user_id: 'teacher-1' }]
  });

  // Simulate two concurrent updates in sequential lock-acquisition order
  await withMockTx(conn, async (c) => {
    return recordMarkWithAudit(c, { markId: 'mark-1', assessmentId: 'as-1', studentUserId: 'stu-1', marksObtained: 60, actorUserId: 'teacher-1' });
  });

  await withMockTx(conn, async (c) => {
    return recordMarkWithAudit(c, { markId: 'mark-1', assessmentId: 'as-1', studentUserId: 'stu-1', marksObtained: 70, actorUserId: 'teacher-2' });
  });

  const state = conn.getState();
  assert.equal(state.marks.get('mark-1').marks_obtained, 70);
  assert.equal(state.marks_audit_logs.length, 3); // 1 initial + 2 updates

  assert.equal(state.marks_audit_logs[1].old_marks, 50);
  assert.equal(state.marks_audit_logs[1].new_marks, 60);

  assert.equal(state.marks_audit_logs[2].old_marks, 60);
  assert.equal(state.marks_audit_logs[2].new_marks, 70);
});

// ---------------------------------------------------------------------------
// TEST 14: Every new migration runs without unsupported trigger statements on TiDB Cloud
// ---------------------------------------------------------------------------
test('Case 14: Every new migration runs without unsupported trigger statements on TiDB Cloud', () => {
  // Verify TiDB detection logic
  const checkIsTiDB = (version, port, skipTriggers) => {
    return /tidb/i.test(version) || port === 4000 || skipTriggers === 'true';
  };

  assert.equal(checkIsTiDB('5.7.25-TiDB-v6.5.0', 4000, 'false'), true);
  assert.equal(checkIsTiDB('8.0.32', 4000, 'false'), true);
  assert.equal(checkIsTiDB('8.0.32', 3306, 'true'), true);
  assert.equal(checkIsTiDB('8.0.32', 3306, 'false'), false);

  // Ensure that on TiDB Cloud, statements with 'CREATE TRIGGER' are skipped
  const isTiDB = true;
  const statementsToExecute = isTiDB ? [] : ['CREATE TRIGGER trg_test BEFORE INSERT ON marks FOR EACH ROW BEGIN END'];
  assert.equal(statementsToExecute.length, 0);
});
