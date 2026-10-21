import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { database } from "./db.mjs";
const sql = database(),
  password = randomBytes(32).toString("hex"),
  session = randomBytes(32).toString("hex"),
  cron = randomBytes(32).toString("hex");
const [role] =
  await sql`SELECT rolname FROM pg_roles WHERE rolname='daniel_preview_app'`;
if (role) throw Error("Runtime role already exists; do not rotate implicitly");
await sql(
  `CREATE ROLE daniel_preview_app LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
);
await sql`GRANT CONNECT ON DATABASE daniel_preview TO daniel_preview_app`;
await sql`GRANT USAGE ON SCHEMA daniel_sales TO daniel_preview_app`;
await sql`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA daniel_sales TO daniel_preview_app`;
await sql`REVOKE UPDATE,DELETE,TRUNCATE ON daniel_sales.audit_events FROM daniel_preview_app`;
await sql`REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON daniel_sales.knowledge FROM daniel_preview_app`;
await sql`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA daniel_sales TO daniel_preview_app`;
await sql`GRANT EXECUTE ON FUNCTION daniel_sales.claim_message(uuid,integer) TO daniel_preview_app`;
const conn = new URL(process.env.DANIEL_DATABASE_URL);
conn.username = "daniel_preview_app";
conn.password = password;
await fs.writeFile(
  ".env.daniel-runtime",
  [
    "DANIEL_DATABASE_URL=" + conn.href,
    "DANIEL_SESSION_SECRET=" + session,
    "DANIEL_CRON_SECRET=" + cron,
    "DANIEL_AGENT_MODE=preview",
    "DANIEL_ALLOWED_HOST=deploy-preview-655--bannersonthefly.netlify.app",
    "DANIEL_SENDER_EMAIL=info@bannersonthefly.com",
  ].join("\n"),
  { mode: 0o600 },
);
console.log("Restricted runtime role provisioned");
