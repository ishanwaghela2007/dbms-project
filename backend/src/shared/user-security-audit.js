/**
 * Audits changes to user security fields (`is_admin`, `is_active`).
 * Replaces MySQL trigger: trg_user_security_audit.
 *
 * Enforces:
 * - Detects actual changes to is_admin or is_active
 * - Correctly handles NULL/undefined and boolean conversions
 * - Avoids inserting duplicate audit logs when values did not change
 * - Executes within caller's active database transaction
 *
 * @param {import('mysql2/promise').Connection} conn Active database connection within transaction
 * @param {string} userId Target user ID whose security settings changed
 * @param {Object} options
 * @param {Object} options.oldValues Previous state { is_admin, is_active }
 * @param {Object} options.newValues New state { is_admin, is_active }
 */
export async function auditUserSecurity(conn, userId, { oldValues = {}, newValues = {} }) {
  const normalize = (val) => {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return val ? '1' : '0';
    if (typeof val === 'number') return val !== 0 ? '1' : '0';
    const s = String(val).trim().toLowerCase();
    if (s === '1' || s === 'true') return '1';
    if (s === '0' || s === 'false') return '0';
    return s;
  };

  const auditedChanges = [];

  // Check is_admin
  if (newValues.is_admin !== undefined) {
    const oldVal = normalize(oldValues.is_admin);
    const newVal = normalize(newValues.is_admin);
    if (oldVal !== newVal) {
      await conn.execute(
        `INSERT INTO user_security_audit_logs (user_id, changed_field, old_value, new_value, changed_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [userId, 'is_admin', oldVal, newVal]
      );
      auditedChanges.push({ field: 'is_admin', oldVal, newVal });
    }
  }

  // Check is_active
  if (newValues.is_active !== undefined) {
    const oldVal = normalize(oldValues.is_active);
    const newVal = normalize(newValues.is_active);
    if (oldVal !== newVal) {
      await conn.execute(
        `INSERT INTO user_security_audit_logs (user_id, changed_field, old_value, new_value, changed_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [userId, 'is_active', oldVal, newVal]
      );
      auditedChanges.push({ field: 'is_active', oldVal, newVal });
    }
  }

  return auditedChanges;
}
