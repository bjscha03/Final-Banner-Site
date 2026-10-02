import { neon } from "@neondatabase/serverless";
import { withLambda } from "@netlify/aws-lambda-compat";
import auth from "./_shared/server-auth.cjs";
import bof from "./_shared/bof-service.cjs";
import emailService from "./_shared/bof-email.cjs";
import { randomBytes } from "node:crypto";
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
const reply = (status, body) => ({
  statusCode: status,
  headers,
  body: JSON.stringify(body),
});
export async function handler(event) {
  if (!["GET", "POST"].includes(event.httpMethod))
    return reply(405, { error: "Method not allowed" });
  const action = event.queryStringParameters?.action || "status";
  if (action === "status")
    return reply(200, {
      enabled: bof.launched() && !auth.isDeployPreviewEnvironment(event),
      acceptingOffers: bof.active() && !auth.isDeployPreviewEnvironment(event),
    });
  const preview = auth.isDeployPreviewEnvironment(event);
  try {
    if ((event.body || "").length > 500000)
      return reply(413, { error: "Request too large" });
    const input =
      event.httpMethod === "POST" ? JSON.parse(event.body || "{}") : {};
    const origin = event.headers?.origin || event.headers?.Origin;
    const host = event.headers?.host || event.headers?.Host;
    if (event.httpMethod === "POST" && origin && new URL(origin).host !== host)
      return reply(403, { error: "Open this page on the BOF website." });
    const db = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!db) return reply(503, { error: "BOF Cash is not configured yet." });
    const sql = neon(db);
    if (action === "admin-preview") {
      if (!auth.getSession(event)?.admin)
        return reply(401, { error: "Admin sign-in required" });
      return reply(200, {
        enabled: bof.active() && !preview,
        email: emailService.content(),
        preview,
      });
    }
    if (preview && action !== "admin")
      return reply(409, {
        error:
          "This review preview cannot access or change real customer wallets.",
      });
    if (action === "admin") {
      if (!auth.getSession(event)?.admin)
        return reply(401, { error: "Admin sign-in required" });
      try {
        if (!preview) await bof.sync(sql);
        const summary =
          await sql`SELECT count(*) FILTER(WHERE b.state IN ('paid','reversed') AND b.referrer_id IS NOT NULL AND b.reward_eligible)::integer AS referred_orders,
          coalesce(sum(b.net_merchandise_cents) FILTER(WHERE b.state='paid'),0)::bigint AS net_sales_cents,
          coalesce(sum(b.contribution_cents+b.wallet_cents+CASE WHEN b.reward_eligible THEN 0 ELSE b.reward_cents END) FILTER(WHERE b.state='paid'),0)::bigint AS contribution_cents,
          coalesce(sum(b.reward_cents) FILTER(WHERE b.state='paid' AND b.reward_eligible),0)::bigint AS rewards_cents,
          coalesce(sum(b.wallet_cents) FILTER(WHERE b.state='paid'),0)::bigint AS redeemed_cents FROM bof_order_benefits b`;
        const customers =
          await sql`SELECT lower(btrim(o.email)) AS email,max(o.customer_name) AS name,count(*)::integer AS orders,
          max(o.created_at) AS last_order,m.code AS member_code,s.status AS invitation_status
          FROM orders o LEFT JOIN profiles p ON lower(btrim(p.email))=lower(btrim(o.email))
          LEFT JOIN bof_members m ON m.user_id=p.id LEFT JOIN marketing_email_sends s ON s.normalized_email=lower(btrim(o.email)) AND s.campaign_key=${emailService.CAMPAIGN}
          WHERE NOT coalesce(o.is_test_order,false) AND o.status IN ('paid','in_production','shipped','delivered','fulfilled')
            AND o.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
          GROUP BY lower(btrim(o.email)),m.code,s.status ORDER BY max(o.created_at) DESC LIMIT 200`;
        return reply(200, {
          enabled: bof.active() && !preview,
          schemaReady: true,
          summary: summary[0],
          customers,
        });
      } catch (error) {
        if (error.code === "42P01")
          return reply(200, {
            enabled: false,
            schemaReady: false,
            customers: [],
            summary: {},
          });
        throw error;
      }
    }
    if (action === "send-invitations") {
      const session = auth.getSession(event);
      if (!session?.admin)
        return reply(401, { error: "Admin sign-in required" });
      if (event.httpMethod !== "POST" || input.confirm !== true)
        return reply(400, {
          error: "Preview and confirm your selected recipients first.",
        });
      if (!bof.active())
        return reply(409, {
          error: "Invitations remain disabled until launch approval.",
        });
      const emails = [
        ...new Set(
          (Array.isArray(input.emails) ? input.emails : []).map((e) =>
            String(e).trim().toLowerCase(),
          ),
        ),
      ];
      if (
        !emails.length ||
        emails.length > 20 ||
        emails.some((e) => !/^\S+@\S+\.\S+$/.test(e))
      )
        return reply(400, {
          error: "Select 1–20 valid customer email addresses.",
        });
      const results = [];
      for (const email of emails)
        results.push(await emailService.sendInvitation(sql, email, session));
      return reply(200, { results });
    }
    if (!bof.active() && !bof.launched())
      return reply(409, {
        error: "The BOF Cash program is awaiting launch approval.",
      });
    if (!bof.active() && ["quote"].includes(action))
      return reply(409, { error: "New BOF Cash offers are paused." });
    if (action === "request-link") {
      if (event.httpMethod !== "POST")
        return reply(405, { error: "Method not allowed" });
      const email = String(input.email || "")
        .trim()
        .toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254)
        return reply(400, { error: "Enter the email used on your order." });
      const ip =
        event.headers?.["x-nf-client-connection-ip"] ||
        event.requestContext?.identity?.sourceIp;
      if (!ip)
        return reply(503, {
          error: "Sign-in links are temporarily unavailable.",
        });
      await emailService.rateLimit(sql, email, ip);
      await emailService.sendAccess(sql, email);
      return reply(200, {
        message:
          "If this email belongs to a BOF customer, a secure sign-in link is on its way. Check your inbox and spam folder.",
      });
    }
    if (action === "claim") {
      if (event.httpMethod !== "POST")
        return reply(405, { error: "Method not allowed" });
      if (!/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(input.token || ""))
        return reply(400, {
          error: "This link is invalid. Request a new one below.",
        });
      // Fail before consuming a link if session signing is not configured.
      auth.createSessionToken({
        id: "configuration-check",
        email: "",
        is_admin: false,
      });
      const result =
        await sql`SELECT * FROM bof_claim_invitation(${emailService.hash(input.token)},${randomBytes(6).toString("hex").toUpperCase()})`;
      const user = result[0];
      return reply(200, { user, sessionToken: auth.createSessionToken(user) });
    }
    const person = await bof.memberForSession(sql, event);
    if (action === "join") {
      if (event.httpMethod !== "POST")
        return reply(405, { error: "Method not allowed" });
      await bof.join(sql, person);
      return reply(200, { ok: true });
    }
    if (action === "release-reservation") {
      if (event.httpMethod !== "POST")
        return reply(405, { error: "Method not allowed" });
      const { cancelReservation } = await import("./_shared/bof-cancel.cjs");
      return reply(
        200,
        await cancelReservation(sql, person.id, input.orderId, event),
      );
    }
    if (action === "wallet")
      return reply(200, {
        joined: !!person.code,
        code: person.code ? `BOFREF-${person.code}` : null,
        ...(person.code ? await bof.wallet(sql, person.id) : {}),
      });
    if (action === "quote") {
      if (event.httpMethod !== "POST" || !person.code)
        return reply(400, { error: "Activate your BOF Cash account first." });
      return reply(
        200,
        await bof.quote(
          sql,
          person,
          input.items,
          input.currentCode,
          Math.min(100000, Math.max(0, Number(input.extraChargedCents) || 0)),
        ),
      );
    }
    return reply(404, { error: "Not found" });
  } catch (error) {
    const message = String(error.message || "");
    if (message.includes("BOF_LINK_EXPIRED"))
      return reply(410, {
        error:
          "This link has expired or was already used. Request a new one below.",
      });
    if (message.includes("BOF_ADMIN_SIGN_IN_REQUIRED"))
      return reply(401, {
        error: "Please use your regular admin sign-in to open your account.",
      });
    if (message.includes("BOF_CUSTOMER_REQUIRED"))
      return reply(409, {
        error: "BOF Cash opens after your first paid order.",
      });
    console.error("[bof-cash]", {
      code: error.code || null,
      status: error.statusCode || 500,
    });
    return reply(error.statusCode || 503, {
      error: error.statusCode
        ? message
        : "BOF Cash is temporarily unavailable. Your balance is safe; please try again.",
    });
  }
}
export default withLambda(handler);
