import { neon } from "@neondatabase/serverless";
export function database(env = process.env) {
  if (!env.DANIEL_DATABASE_URL)
    throw new Error("Missing dedicated database connection");
  return neon(env.DANIEL_DATABASE_URL);
}
export async function logEvent(sql, type, id, event, metadata = {}) {
  return sql`INSERT INTO daniel_sales.audit_events(entity_type, entity_id, event_type, actor, metadata_json) VALUES(${type}, ${String(id)}, ${event}, 'daniel-worker', ${JSON.stringify(metadata)}::jsonb)`;
}
