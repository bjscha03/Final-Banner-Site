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
    : "Give friends a deal. Get BOF Cash.";
  const preheader = access
    ? "Your secure sign-in link is ready. It expires in 15 minutes."
    : "Earn $5–$10 per qualifying referral. Your friends can save up to $25.";
  const address = escape(
    process.env.MARKETING_PHYSICAL_ADDRESS || "PO Box 369, Crestwood, KY 40014",
  );
  const fullTerms =
    "Earn $5 for a new customer's qualifying $50–$99.99 first order, or $10 for $100+. Orders containing magnets require $75 in eligible merchandise. Friends save 25% on eligible banners and yard signs or 10% on magnets, up to $25 total. Rewards become available 14 days after shipment. Use credit on $50+ eligible merchandise, covering up to 25% of banners and yard signs or 15% of magnets. No stacking; the better offer wins. Finishing, stakes, services, shipping, tax, and options awaiting supplier-cost confirmation are excluded. Exact eligibility and savings are shown before payment. BOF Cash has no expiration or cash value and cannot be transferred. One reward per new customer; no self-referrals. Refunds and chargebacks may reverse rewards.";
  const sharingLink = (channel) => {
    const url = new URL(link);
    url.searchParams.set("share", channel);
    return escape(url.toString());
  };
  const cta = `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#c94e00" style="border-radius:6px;background:#c94e00;text-align:center;mso-padding-alt:16px 24px"><a href="${escape(link)}" style="display:inline-block;padding:16px 24px;border:1px solid #c94e00;border-radius:6px;color:#ffffff;font-size:16px;line-height:20px;font-weight:700;text-decoration:none">${access ? "Open my BOF Cash" : "Get my referral link"}&nbsp; &rarr;</a></td></tr></table>`;
  const body = access
    ? `<tr><td class="email-pad" style="padding:32px;color:#122641"><h1 style="margin:0 0 16px;font-size:32px;line-height:38px;letter-spacing:-1px">Welcome back.</h1><p style="margin:0 0 24px;font-size:16px;line-height:25px;color:#475569">Open your BOF Cash wallet to see your balance, copy your personal referral link, or share with friends.</p>${cta}<p style="margin:20px 0 0;font-size:13px;line-height:21px;color:#64748b">This sign-in link expires in 15 minutes and works once. If you didn’t request it, you can ignore this email.</p></td></tr>`
    : `
    <tr><td style="padding:0;background:#f6b82f"><img src="${SITE}/images/email/september-grand-opening-banner.jpg" width="600" height="315" alt="A colorful grand-opening banner welcomes friends to a neighborhood coffee shop" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>
    <tr><td class="email-pad" bgcolor="#122641" style="padding:30px 36px 32px;background:#122641;color:#ffffff;border-bottom:6px solid #f45b08">
      <p style="margin:0 0 12px;font-size:11px;line-height:16px;letter-spacing:2px;font-weight:700;color:#ffad73">INTRODUCING BOF CASH</p>
      <h1 class="email-headline" style="margin:0 0 14px;font-size:44px;line-height:46px;letter-spacing:-1.5px;font-weight:800;color:#ffffff">Share BOF.<br>Earn BOF Cash.</h1>
      <p style="margin:0 0 22px;font-size:16px;line-height:25px;color:#e3ebf7">Big openings. Weekend events. Their next big idea.<br>Send a friend our way and get more for yours.</p>
      ${cta}
      <p style="margin:13px 0 0;font-size:12px;line-height:19px;color:#d2def0">Free to join. Guest checkout customers are welcome.<br>No password needed.</p>
    </td></tr>
    <tr><td class="email-pad" bgcolor="#fff3e8" style="padding:26px 36px;background:#fff3e8">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed"><tr>
        <td width="50%" valign="top" style="padding-right:16px;border-right:1px solid #e6cbb8">
          <p style="margin:0 0 8px;color:#8a390b;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.5px">YOU EARN</p>
          <p class="reward-number" style="margin:0 0 6px;color:#122641;font-size:36px;line-height:40px;font-weight:800;letter-spacing:-1px;white-space:nowrap">$5–$10</p>
          <p style="margin:0;color:#604d40;font-size:13px;line-height:20px">BOF Cash per<br>qualifying referral</p>
        </td>
        <td width="50%" valign="top" style="padding-left:22px">
          <p style="margin:0 0 8px;color:#8a390b;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.5px">FRIEND SAVES</p>
          <p class="reward-number" style="margin:0 0 6px;color:#122641;font-size:36px;line-height:40px;font-weight:800;letter-spacing:-1px;white-space:nowrap"><span style="font-size:13px;letter-spacing:0;font-weight:500">up to </span>$25</p>
          <p style="margin:0;color:#604d40;font-size:13px;line-height:20px">on their qualifying<br>first order</p>
        </td>
      </tr></table>
    </td></tr>
    <tr><td class="email-pad" style="padding:30px 36px">
      <h2 style="margin:0 0 10px;font-size:24px;line-height:29px;letter-spacing:-.5px;color:#122641">Good news travels.</h2>
      <p style="margin:0 0 18px;font-size:15px;line-height:24px;color:#475569">Share your personal link on Facebook, text it to a friend, or send an email. First time? Activate your free account, then choose how to share.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed"><tr>
        <td width="32%" align="center" bgcolor="#1877f2" style="border-radius:6px;background:#1877f2;mso-padding-alt:14px 4px"><a aria-label="Share on Facebook" href="${sharingLink("facebook")}" style="display:block;padding:14px 4px;font-size:13px;line-height:18px;font-weight:700;color:#ffffff;text-decoration:none">Facebook &rarr;</a></td>
        <td width="2%"></td>
        <td width="32%" align="center" bgcolor="#122641" style="border-radius:6px;background:#122641;mso-padding-alt:14px 4px"><a aria-label="Text a friend" href="${sharingLink("text")}" style="display:block;padding:14px 4px;font-size:13px;line-height:18px;font-weight:700;color:#ffffff;text-decoration:none">Text a friend</a></td>
        <td width="2%"></td>
        <td width="32%" align="center" bgcolor="#122641" style="border-radius:6px;background:#122641;mso-padding-alt:14px 4px"><a aria-label="Email a friend" href="${sharingLink("email")}" style="display:block;padding:14px 4px;font-size:13px;line-height:18px;font-weight:700;color:#ffffff;text-decoration:none">Email a friend</a></td>
      </tr></table>
      <p style="margin:15px 0 0;font-size:12px;line-height:19px;color:#64748b">Prefer a code? Yours is in your BOF Cash account, too.<br>No photo, review, or public post is required.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;border-top:1px solid #e2e8f0"><tr><td style="padding-top:22px">
        <p style="margin:0 0 6px;font-size:16px;line-height:23px;font-weight:700;color:#122641">More for your next project.</p>
        <p style="margin:0;font-size:14px;line-height:23px;color:#475569">Use your BOF Cash toward <strong>banners, yard signs, and car magnets.</strong> Find your balance and sharing tools in your account. Credits don’t expire.</p>
      </td></tr></table>
    </td></tr>
    <tr><td class="email-pad" bgcolor="#f8fafc" style="padding:22px 36px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:12px;line-height:19px">
      <p style="margin:0 0 9px">Earn $5 on a qualifying $50–$99.99 first order or $10 on $100+. Orders with magnets require $75. Friends save 25% on eligible banners/signs or 10% on magnets, up to $25. Rewards are available 14 days after shipment.</p>
      <p style="margin:0 0 12px">Use credit on $50+ eligible merchandise, up to 25% for banners/signs or 15% for magnets. Offers don't stack. Eligibility and exclusions apply.</p>
      <a href="${SITE}/bof-cash#terms" style="color:#18448d;font-weight:700;text-decoration:underline">See full program terms</a>
    </td></tr>`;
  return {
    subject,
    text: access
      ? `Your secure BOF Cash sign-in link\n\nOpen my BOF Cash: ${link}\n\nThis sign-in link expires in 15 minutes and works once. If you didn't request it, you can ignore this email.`
      : `Share BOF. Earn BOF Cash.\n\nYOU EARN: $5–$10 BOF Cash per qualifying referral.\nYOUR FRIEND SAVES: Up to $25 on their qualifying first order.\n\nUse BOF Cash toward banners, yard signs, or car magnets.\n\nGet my referral link: ${link}\nFree to join. Guest checkout customers are welcome. No password needed.\n\nActivate your free account, then share your personal link on Facebook, text it to a friend, or send an email. Your referral code and wallet are in your BOF Cash account, too.\nNo photo or public post is required.\n\n${fullTerms}\nFull program terms: ${SITE}/bof-cash#terms\n\nBanners On The Fly · ${process.env.MARKETING_PHYSICAL_ADDRESS || "PO Box 369, Crestwood, KY 40014"}\nUnsubscribe: ${unsubscribe}`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(subject)}</title><style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-collapse:separate;mso-table-lspace:0pt;mso-table-rspace:0pt}body{margin:0!important;padding:0!important}a{color:inherit}img{-ms-interpolation-mode:bicubic}@media only screen and (max-width:420px){.outer-pad{padding:12px 8px!important}.email-pad{padding-left:22px!important;padding-right:22px!important}.email-headline{font-size:36px!important;line-height:39px!important}.reward-number{font-size:29px!important;line-height:34px!important}}</style></head><body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#122641"><div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escape(preheader)}</div><table data-email-root role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eef2f7"><tr><td class="outer-pad" align="center" style="padding:24px 16px"><!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]--><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="max-width:600px;border-radius:12px;overflow:hidden;border:1px solid #dce3ed;background:#ffffff"><tr><td align="center" bgcolor="#ffffff" style="padding:24px 28px;background:#ffffff"><a href="${SITE}" style="text-decoration:none"><img src="${SITE}/images/header-logo.png" alt="Banners On The Fly" width="240" style="display:block;width:240px;max-width:100%;height:auto;border:0"></a></td></tr>${body}</table><!--[if mso]></td></tr></table><![endif]--><p style="margin:20px 12px 6px;font-size:11px;line-height:18px;color:#64748b">Banners On The Fly · ${address}</p>${access ? "" : `<p style="margin:0 12px;font-size:11px;line-height:18px;color:#64748b"><a href="${escape(unsubscribe)}" style="color:#64748b;text-decoration:underline">Unsubscribe from marketing emails</a></p>`}</td></tr></table></body></html>`,
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
  if (
    (
      await sql`SELECT 1 FROM bof_members m JOIN profiles p ON p.id=m.user_id WHERE lower(btrim(p.email))=${String(email).trim().toLowerCase()}`
    ).length
  )
    return "";
  if ((await suppression.findEmailSuppression(sql, email)).suppressed)
    return "";
  const link = await invitation(sql, email);
  return `<div style="margin-top:24px;padding:16px;background:#f1f5f9;border-radius:8px"><strong>Earn BOF Cash</strong><p style="font-size:13px">Invite friends and earn up to $10 per qualifying first order toward banners, yard signs, and car magnets. Sharing photos is optional.</p><a href="${escape(link)}">Get my referral link &rarr;</a></div>`;
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
