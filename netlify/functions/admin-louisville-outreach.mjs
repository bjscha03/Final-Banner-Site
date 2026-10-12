import { neon } from "@neondatabase/serverless";
import { withLambda } from "@netlify/aws-lambda-compat";
import auth from "./_shared/server-auth.cjs";
import outreach from "./_shared/louisville-outreach.cjs";
import {
  walletStatus,
  certificateRequest,
  configureCertificate,
} from "./_shared/louisville-wallet.mjs";
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const reply = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
});
export async function handler(event) {
  const access = auth.requireAdmin(event);
  if (!access.ok) return reply(401, { error: "Admin sign-in required." });
  if (!["GET", "POST"].includes(event.httpMethod))
    return reply(405, { error: "Method not allowed." });
  try {
    const origin = event.headers?.origin || event.headers?.Origin;
    const host = event.headers?.host || event.headers?.Host;
    if (event.httpMethod === "POST" && origin && new URL(origin).host !== host)
      return reply(403, { error: "Open this page on the BOF website." });
    if ((event.body || "").length > 250000)
      return reply(413, {
        error: "Import up to 250 contacts or a certificate smaller than 30 KB.",
      });
    const input =
      event.httpMethod === "POST" ? JSON.parse(event.body || "{}") : {};
    const action = event.queryStringParameters?.action || "list";
    const preview = auth.isDeployPreviewEnvironment(event);
    if (action !== "list" && event.httpMethod !== "POST")
      return reply(405, { error: "Use POST for this action." });
    if (action === "preview")
      return reply(200, {
        email: outreach.emailContent({
          name: input.name,
          company: input.company,
          discount_code: outreach.CODE_PATTERN.test(input.code || "")
            ? input.code
            : "LOU25-YOUR-PERSONAL-CODE",
        }),
      });
    if (action === "parse")
      return reply(200, outreach.parseContacts(input.text));
    if (preview) {
      if (action === "list")
        return reply(200, {
          contacts: [],
          total: 0,
          preview: true,
          wallet: {
            ready: false,
            reason: "Wallet setup is available in production admin.",
          },
          email: outreach.emailContent({ name: "Bob" }),
        });
      return reply(409, {
        error:
          "Imports, Wallet setup and email sending are disabled in deploy previews.",
      });
    }
    if (action === "certificate-request")
      return reply(200, await certificateRequest());
    if (action === "certificate")
      return reply(200, {
        wallet: await configureCertificate(input.certificate),
      });
    const db = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!db)
      return reply(503, { error: "The contact database is unavailable." });
    const sql = neon(db);
    await outreach.ensureSchema(sql);
    if (action === "list") {
      const page = Math.max(
        0,
        Math.min(100000, parseInt(event.queryStringParameters?.page, 10) || 0),
      );
      const search = String(event.queryStringParameters?.search || "")
        .trim()
        .slice(0, 120);
      const query = `%${search}%`;
      const contacts =
        await sql`SELECT c.id,c.email,c.name,c.company,c.discount_code,c.created_at,
        s.status AS email_status,s.sent_at,s.error_message,d.used AS coupon_used
        FROM louisville_outreach_contacts c LEFT JOIN marketing_email_sends s ON s.campaign_key=${outreach.CAMPAIGN} AND s.normalized_email=c.email
        LEFT JOIN discount_codes d ON d.code=c.discount_code
        WHERE (c.email ILIKE ${query} OR c.name ILIKE ${query} OR c.company ILIKE ${query})
        ORDER BY c.created_at DESC,c.id LIMIT 100 OFFSET ${page * 100}`;
      const counts =
        await sql`SELECT count(*)::integer AS total FROM louisville_outreach_contacts WHERE (email ILIKE ${query} OR name ILIKE ${query} OR company ILIKE ${query})`;
      const wallet = await walletStatus().catch(() => ({
        ready: false,
        reason: "Wallet setup could not be loaded. Please retry.",
      }));
      return reply(200, {
        contacts,
        total: counts[0].total,
        page,
        wallet,
        preview: false,
        email: outreach.emailContent({ name: "Bob" }),
      });
    }
    if (action === "import")
      return reply(
        200,
        await outreach.importContacts(sql, input.contacts, access.session),
      );
    if (action === "send") {
      if (input.confirm !== true || !/^[a-f0-9-]{36}$/i.test(input.id || ""))
        return reply(400, {
          error: "Choose and review a recipient before sending.",
        });
      if (!process.env.RESEND_API_KEY)
        return reply(503, { error: "Email delivery is not configured." });
      if (!(await walletStatus()).ready)
        return reply(409, {
          error: "Finish Apple Wallet setup before sending this invitation.",
        });
      const rows =
        await sql`SELECT c.* FROM louisville_outreach_contacts c JOIN discount_codes d ON d.code=c.discount_code WHERE c.id=${input.id}::uuid AND COALESCE(d.used,FALSE)=FALSE`;
      if (!rows.length)
        return reply(404, {
          error: "Contact unavailable or coupon already used.",
        });
      return reply(
        200,
        await outreach.sendInvitation(sql, rows[0], access.session),
      );
    }
    return reply(400, { error: "Unknown outreach action." });
  } catch (error) {
    // Certificate/private-key/database/provider contents must never enter logs
    // or admin responses. Only deliberately safe application messages escape.
    const status = error.statusCode || 500;
    return reply(status, {
      error:
        status < 500
          ? error.message
          : status === 503 && error.statusCode
            ? error.message
            : "The request could not be completed. Please retry.",
    });
  }
}
export default withLambda(handler);
