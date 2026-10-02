"use strict";
const crypto = require("node:crypto");
const { Resend } = require("resend");
const auth = require("./server-auth.cjs");
const marketing = require("./marketing-email-store.cjs");
const tokens = require("./marketing-email-token.cjs");
const suppression = require("./email-suppression.cjs");
const bof = require("./bof-service.cjs");
const CAMPAIGN = "bof-referral-v1";
const SITE = "https://bannersonthefly.com";
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const secret = () =>
  process.env.AUTH_SESSION_SECRET || process.env.CLOUDINARY_API_SECRET || "";
function token(id) {
  if (!secret()) throw new Error("Account access is not configured");
  return (
    id +
    "." +
    crypto
      .createHmac("sha256", secret())
      .update("bof-invitation-v1:" + id)
      .digest("hex")
  );
}
function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
async function invitation(
  sql,
  email,
  { id = crypto.randomUUID(), minutes = 10080 } = {},
) {
  const raw = token(id);
  await sql`INSERT INTO bof_invitations(id,email,token_hash,expires_at) VALUES(${id}::uuid,${email},${hash(raw)},now()+(${minutes}*interval '1 minute')) ON CONFLICT(id) DO NOTHING`;
  return `${SITE}/bof-cash#claim=${raw}`;
}
function content({
  link = SITE + "/bof-cash",
  unsubscribe = SITE + "/bof-cash",
  access = false,
} = {}) {
  const subject = access
    ? "Your secure BOF Cash sign-in link"
    : "Your next banner could start with BOF Cash";
  const intro = access
    ? "Use the button below to securely open your BOF Cash account. This sign-in link expires in 15 minutes and works once."
    : "Thanks for choosing Banners On The Fly. Invite friends and earn store credit toward banners, yard signs, or car magnets.";
  const details = access
    ? "If you didn’t request this email, you can ignore it."
    : "Earn $5 when a new customer places a qualifying $50–$99.99 order, or $10 on $100+. Orders containing magnets require $75. Friends get 25% off eligible banners and yard signs, or 10% off magnets, up to $25 total. Credits become available 14 days after shipment. No photo or public post is required.";
  const terms =
    "Use credit on $50+ eligible merchandise: up to 25% for banners and yard signs, or 15% for magnets. No stacking with other promotions; the better offer wins. Eligibility and the exact discount are shown before payment. Finishing, stakes, services, shipping, and tax are excluded. Options awaiting supplier-cost confirmation are ineligible. BOF Cash has no expiration or cash value. One reward per new customer; no self-referrals. Refunds and chargebacks can reverse rewards.";
  const footer = access
    ? ""
    : `<p style="font-size:12px;color:#64748b">${escape(terms)}</p><p style="font-size:12px;color:#64748b">Banners On The Fly · ${escape(process.env.MARKETING_PHYSICAL_ADDRESS || "PO Box 369, Crestwood, KY 40014")}<br><a href="${escape(unsubscribe)}">Unsubscribe from marketing emails</a></p>`;
  return {
    subject,
    text: `${intro}\n\n${details}\n\n${access ? "Open my account" : "Activate my BOF Cash"}: ${link}\n\n${access ? "" : terms + "\nUnsubscribe: " + unsubscribe}`,
    html: `<!doctype html><html><body style="margin:0;background:#f3f6fa;font-family:Arial,sans-serif;color:#16243d"><div style="max-width:560px;margin:24px auto;padding:32px;background:white;border-radius:16px"><p style="font-weight:700;color:#1e3a8a">BANNERS ON THE FLY</p><h1 style="font-size:28px">${access ? "Welcome back." : "Share a little. Earn something useful."}</h1><p style="line-height:1.6">${escape(intro)}</p><p style="line-height:1.6">${escape(details)}</p><p style="margin:28px 0"><a href="${escape(link)}" style="background:#ed5c28;color:white;padding:14px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:700">${access ? "Open my BOF Cash" : "Activate my BOF Cash"}</a></p>${access ? "" : "<p>Checked out as a guest? This link verifies your email and connects your existing purchases. No password is needed.</p>"}${footer}</div></body></html>`,
  };
}
async function isCustomer(sql, email) {
  return (
    (
      await sql`SELECT id FROM orders WHERE lower(btrim(email))=${email} AND NOT coalesce(is_test_order,false) AND status IN ('paid','in_production','shipped','delivered','fulfilled') LIMIT 1`
    ).length > 0
  );
}
async function rateLimit(sql, email, ip) {
  const now = new Date(),
    hour = now.toISOString().slice(0, 13),
    minute = now.toISOString().slice(0, 16);
  for (const [key, limit] of [
    [`email:${email}:${minute}`, 1],
    [`ip:${ip}:${hour}`, 10],
  ]) {
    const bucket = crypto
      .createHmac("sha256", secret())
      .update(key)
      .digest("hex");
    const rows =
      await sql`INSERT INTO bof_rate_limits(bucket,hits,expires_at) VALUES(${bucket},1,now()+interval '2 hours') ON CONFLICT(bucket) DO UPDATE SET hits=bof_rate_limits.hits+1 RETURNING hits`;
    if (rows[0].hits > limit)
      throw Object.assign(
        new Error("Please wait before requesting another link."),
        { statusCode: 429 },
      );
  }
}
async function sendAccess(sql, email) {
  if (!(await isCustomer(sql, email))) return;
  const stop = await suppression.findEmailSuppression(sql, email);
  if (
    stop?.suppressed &&
    ![
      "unsubscribe",
      "unsubscribed",
      "newsletter_unsubscribed",
      "consent_declined",
    ].includes(stop.reason)
  )
    return;
  const id = crypto.randomUUID();
  const link = await invitation(sql, email, { id, minutes: 15 });
  const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
    {
      from:
        process.env.EMAIL_FROM_INFO ||
        process.env.EMAIL_FROM ||
        "Banners On The Fly <info@bannersonthefly.com>",
      to: email,
      ...content({ link, access: true }),
      replyTo: "support@bannersonthefly.com",
    },
    { idempotencyKey: "bof-access/" + id },
  );
  if (result.error)
    throw Object.assign(
      new Error("We could not send your sign-in link. Please try again."),
      { statusCode: 503 },
    );
}
async function sendInvitation(sql, email, admin = {}) {
  if (!bof.active() || auth.isDeployPreviewEnvironment({}))
    throw Object.assign(
      new Error("Invitations are disabled until the program is launched."),
      { statusCode: 409 },
    );
  if (!(await isCustomer(sql, email)))
    return { email, status: "skipped", reason: "No qualifying paid order" };
  if (
    (
      await sql`SELECT 1 FROM bof_members m JOIN profiles p ON p.id=m.user_id WHERE lower(btrim(p.email))=${email}`
    ).length
  )
    return { email, status: "skipped", reason: "Already joined" };
  const stop = await suppression.findEmailSuppression(sql, email);
  if (stop?.suppressed)
    return { email, status: "skipped", reason: "Marketing emails suppressed" };
  await marketing.ensureMarketingEmailSchema(sql);
  const unsubscribeToken = tokens.createMarketingUnsubscribeToken(
    email,
    CAMPAIGN,
  );
  const unsubscribe = tokens.buildMarketingUnsubscribeUrl(unsubscribeToken);
  const id = crypto.randomUUID();
  const subject = content().subject;
  const rows =
    await sql`INSERT INTO marketing_email_sends(campaign_key,normalized_email,recipient_email,subject,sending_admin_id,sending_admin_email,status,request_id,provider_idempotency_key,unsubscribe_token_hash)
    VALUES(${CAMPAIGN},${email},${email},${subject},${admin.sub || null},${admin.email || null},'processing',${id},${"bof-referral/" + id},${tokens.hashMarketingUnsubscribeToken(unsubscribeToken)})
    ON CONFLICT(campaign_key,normalized_email) DO UPDATE SET status='processing',attempt_count=marketing_email_sends.attempt_count+1,last_attempt_at=now(),updated_at=now()
      WHERE marketing_email_sends.status IN ('error','processing') AND marketing_email_sends.last_attempt_at<now()-interval '5 minutes'
        AND marketing_email_sends.created_at>now()-interval '23 hours'
    RETURNING request_id,provider_idempotency_key`;
  if (!rows.length)
    return {
      email,
      status: "skipped",
      reason: "Already invited or awaiting delivery reconciliation",
    };
  const send = rows[0],
    link = await invitation(sql, email, { id: send.request_id });
  try {
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
      {
        from:
          process.env.EMAIL_FROM_INFO ||
          process.env.EMAIL_FROM ||
          "Banners On The Fly <info@bannersonthefly.com>",
        to: email,
        replyTo: "support@bannersonthefly.com",
        ...content({ link, unsubscribe }),
        headers: {
          "List-Unsubscribe": `<${unsubscribe}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        tags: [{ name: "campaign", value: CAMPAIGN }],
      },
      { idempotencyKey: send.provider_idempotency_key },
    );
    if (result.error)
      throw new Error(result.error.message || "Delivery failed");
    await sql`UPDATE marketing_email_sends SET status='sent',sent_at=now(),updated_at=now(),resend_message_id=${result.data?.id || null},error_message=NULL WHERE campaign_key=${CAMPAIGN} AND normalized_email=${email}`;
    return { email, status: "sent" };
  } catch (error) {
    await sql`UPDATE marketing_email_sends SET status='error',updated_at=now(),error_message=${String(error.message).slice(0, 400)} WHERE campaign_key=${CAMPAIGN} AND normalized_email=${email}`;
    return {
      email,
      status: "failed",
      reason: "Delivery failed; retry is safe within 23 hours",
    };
  }
}
async function confirmationBlock(sql, email, isTest) {
  if (!bof.active() || isTest || auth.isDeployPreviewEnvironment({})) return "";
  if ((await suppression.findEmailSuppression(sql, email)).suppressed)
    return "";
  const link = await invitation(sql, email);
  return `<div style="margin-top:24px;padding:16px;background:#f1f5f9;border-radius:8px"><strong>Earn BOF Cash</strong><p style="font-size:13px">Invite friends and earn up to $10 per qualifying first order toward banners, yard signs, and car magnets. Sharing photos is optional.</p><a href="${escape(link)}">Activate your BOF Cash account</a></div>`;
}
module.exports = {
  CAMPAIGN,
  content,
  invitation,
  hash,
  isCustomer,
  rateLimit,
  sendAccess,
  sendInvitation,
  confirmationBlock,
};
