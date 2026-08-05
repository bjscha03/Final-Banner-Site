'use strict';

const { sanitizeForAudit } = require('./security.cjs');

async function appendAudit(sql, entry) {
  const rows = await sql(
    `INSERT INTO outbound_audit_log (
       actor_type, actor_id, action, entity_type, entity_id,
       previous_values, new_values, metadata, request_id
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9)
     RETURNING id, created_at`,
    [
      entry.actorType || 'system',
      entry.actorId || null,
      entry.action,
      entry.entityType,
      entry.entityId ? String(entry.entityId) : null,
      entry.previousValues == null ? null : JSON.stringify(sanitizeForAudit(entry.previousValues)),
      entry.newValues == null ? null : JSON.stringify(sanitizeForAudit(entry.newValues)),
      JSON.stringify(sanitizeForAudit(entry.metadata || {})),
      entry.requestId || null,
    ],
  );
  return rows[0] || null;
}

module.exports = { appendAudit };
