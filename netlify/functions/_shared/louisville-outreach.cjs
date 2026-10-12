"use strict";
const crypto = require("node:crypto");
const { Resend } = require("resend");
const marketing = require("./marketing-email-store.cjs");
const tokens = require("./marketing-email-token.cjs");
const suppression = require("./email-suppression.cjs");
const CAMPAIGN = "louisville-neighbors-25-v1";
const SITE = "https://bannersonthefly.com";
const TERMS =
  "25% off banner items on one purchase. Use the email address that received this invitation at checkout. Other products, shipping and tax excluded. Cannot be combined with other offers; the better discount applies. No cash value. No expiration. Free next-day air shipping after production; production time and business-day cutoffs apply. Your delivery estimate appears before payment.";
const CODE_PATTERN = /^LOU25-[A-F0-9]{20}$/;
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const clean = (s, max = 120) =>
  String(s || "")
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
let schemaPromise;
async function ensureSchema(sql) {
  if (!schemaPromise)
    schemaPromise = (async () => {
      await marketing.ensureMarketingEmailSchema(sql);
      await sql`CREATE TABLE IF NOT EXISTS louisville_outreach_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '',
      discount_code TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT, CHECK(email=lower(email))
    )`;
    })().catch((e) => {
      schemaPromise = null;
      throw e;
    });
  return schemaPromise;
}
function parseContacts(source) {
  const text = String(source || "").replace(/^\uFEFF/, "");
  if (!text.trim())
    return {
      contacts: [],
      errors: ["Add an email list first."],
      duplicates: 0,
    };
  if (text.length > 150000)
    throw Object.assign(Error("Import up to 250 contacts at a time."), {
      statusCode: 413,
    });
  const separator = text.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === separator || c === "\n")) {
      row.push(value.trim());
      value = "";
      if (c === "\n") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else if (c !== "\r") value += c;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  if (quoted)
    return {
      contacts: [],
      errors: ["A quoted field is missing its closing quote."],
      duplicates: 0,
    };
  const headers = rows[0].map((c) => c.toLowerCase().replace(/[ _-]/g, ""));
  const emailIndex = headers.findIndex((c) =>
    ["email", "emailaddress"].includes(c),
  );
  const hasHeaders = emailIndex >= 0;
  const contacts = [],
    errors = [],
    seen = new Set();
  let duplicates = 0;
  if (rows.length - Number(hasHeaders) > 250)
    return {
      contacts: [],
      errors: ["Import up to 250 contacts at a time."],
      duplicates: 0,
    };
  for (const [i, cells] of rows.slice(Number(hasHeaders)).entries()) {
    const field = (...keys) => {
      const at = headers.findIndex((h) => keys.includes(h));
      return at >= 0 ? cells[at] || "" : "";
    };
    const email = tokens.normalizeEmail(
      hasHeaders ? cells[emailIndex] : cells.find((c) => c.includes("@")),
    );
    if (!email) {
      errors.push(
        `Row ${i + 1 + Number(hasHeaders)}: enter a valid email address.`,
      );
      continue;
    }
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);
    const name = hasHeaders
      ? field("name", "fullname", "contactname") ||
        [field("firstname", "first"), field("lastname", "last")]
          .filter(Boolean)
          .join(" ")
      : cells.length > 1 && !cells[0].includes("@")
        ? cells[0]
        : "";
    const company = hasHeaders
      ? field("company", "companyname", "business", "businessname")
      : cells.length > 2
        ? cells[2]
        : "";
    contacts.push({ email, name: clean(name), company: clean(company, 160) });
  }
  return { contacts, errors, duplicates };
}
async function importContacts(sql, contacts, admin) {
  if (!Array.isArray(contacts) || !contacts.length || contacts.length > 250)
    throw Object.assign(Error("Choose 1–250 valid contacts."), {
      statusCode: 400,
    });
  // One atomic statement: contacts and coupons always exist together. Existing
  // recipients retain their original name/code to keep send retries identical.
  const input = contacts.map((c) => {
    const email = tokens.normalizeEmail(c.email);
    if (!email)
      throw Object.assign(Error("Invalid email address."), { statusCode: 400 });
    return {
      email,
      name: clean(c.name),
      company: clean(c.company, 160),
      code: `LOU25-${crypto.randomBytes(10).toString("hex").toUpperCase()}`,
    };
  });
  const rows = await sql`WITH added AS (
    INSERT INTO louisville_outreach_contacts(email,name,company,discount_code,created_by)
    SELECT email,name,company,code,${admin.sub || null} FROM jsonb_to_recordset(${JSON.stringify(input)}::jsonb) AS x(email text,name text,company text,code text)
    ON CONFLICT(email) DO NOTHING RETURNING *
  ), coupons AS (
    INSERT INTO discount_codes(code,email,discount_percentage,single_use,used,expires_at,status,issued_at,campaign,max_uses_per_customer,max_total_uses,created_at,updated_at)
    SELECT discount_code,email,25,TRUE,FALSE,NULL,'unused',NOW(),${CAMPAIGN},1,1,NOW(),NOW() FROM added
    RETURNING code
  ) SELECT id,email FROM added`;
  return { imported: rows.length, existing: input.length - rows.length };
}
function emailContent(
  lead = {},
  unsubscribe = `${SITE}/louisville-offer`,
  wallet = true,
) {
  const firstName = clean(lead.name).split(" ")[0];
  const subject = firstName
    ? `Hey ${firstName}, save 25% on your next banner + free next-day air`
    : "Louisville, your next banner is 25% off + free next-day air";
  const code = lead.discount_code || "LOU25-YOUR-PERSONAL-CODE";
  const link = `${SITE}/louisville-offer?code=${encodeURIComponent(code)}`;
  const design = `${link}&start=1`;
  const walletLink = `${SITE}/.netlify/functions/louisville-coupon?action=wallet&code=${encodeURIComponent(code)}`;
  const greeting = firstName
    ? `Hey ${firstName},`
    : "Hello, Louisville neighbor!";
  const intro = `We’d love to help ${lead.company ? clean(lead.company, 160) : "you"} stand out on your next banner purchase. Here’s a little something from your neighbors at Banners On The Fly.`;
  const address =
    process.env.MARKETING_PHYSICAL_ADDRESS || "PO Box 369, Crestwood, KY 40014";
  const text = `${greeting}\n\n${intro}\n\n25% OFF YOUR NEXT BANNER\nPlus free next-day air shipping after production.\nYour personal code: ${code}\n\nStart designing with 25% off: ${design}\nCopy your code: ${link}\n${wallet ? `Save your coupon to Apple Wallet: ${walletLink}\n` : ""}\n${TERMS}\n\nHave a question? Reply to this email.\nBanners On The Fly · ${address}\nUnsubscribe: ${unsubscribe}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title><style>body{margin:0!important}table{border-collapse:separate;mso-table-lspace:0;mso-table-rspace:0}@media(max-width:420px){.pad{padding:24px!important}.headline{font-size:32px!important;line-height:36px!important}.code{font-size:16px!important}}</style></head><body style="background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#122641"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">A personal banner offer for our Louisville neighbors. Save now or keep it in Apple Wallet for later.</div><table data-email-root role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:white;border:1px solid #dce3ed;border-radius:16px;overflow:hidden"><tr><td align="center" style="padding:26px"><img src="${SITE}/images/header-logo.png" width="240" alt="Banners On The Fly" style="width:240px;max-width:100%;height:auto;display:block"></td></tr><tr><td class="pad" style="padding:32px;background:#122641;color:white"><p style="margin:0 0 16px;color:#ffb37d;font-size:12px;font-weight:bold;letter-spacing:2px">A LITTLE LOCAL LOVE · LOUISVILLE</p><h1 class="headline" style="margin:0;font-size:40px;line-height:44px;letter-spacing:-1px">Your next big idea.<br>A little less.</h1></td></tr><tr><td class="pad" style="padding:32px"><p style="font-size:18px;font-weight:bold;margin:0 0 12px">${escape(greeting)}</p><p style="font-size:16px;line-height:25px;color:#475569;margin:0 0 26px">${escape(intro)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff3e8;border:2px dashed #f45b08;border-radius:12px"><tr><td align="center" style="padding:26px 14px"><p style="margin:0;color:#9b3c00;font-size:11px;font-weight:bold;letter-spacing:2px">YOUR PERSONAL BANNER COUPON</p><p style="margin:9px 0 0;font-size:64px;line-height:70px;font-weight:900;color:#122641;letter-spacing:-3px">25% OFF</p><p style="font-size:16px;font-weight:bold;margin:5px 0 20px;color:#18448d">+ FREE NEXT-DAY AIR</p><p class="code" style="margin:0;font-family:Consolas,monospace;font-size:20px;font-weight:bold;color:#122641;word-break:break-all">${escape(code)}</p><p style="margin:10px 0 0;font-size:12px;color:#64748b">One purchase. No expiration.</p></td></tr></table><a href="${escape(design)}" style="display:block;text-align:center;background:#c94e00;color:white;text-decoration:none;font-weight:bold;font-size:16px;padding:18px 16px;margin:24px 0 12px;border-radius:8px">Start designing with 25% off →</a><p style="text-align:center;margin:0 0 24px;font-size:14px"><a href="${escape(link)}" style="color:#18448d;text-decoration:underline">Open &amp; copy your code</a></p>${wallet ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:10px"><tr><td align="center" style="padding:22px"><p style="margin:0 0 12px;font-weight:bold;font-size:16px">Not ordering today? Keep your coupon.</p><a href="${escape(walletLink)}" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#111827;color:#fff;text-decoration:none;font-size:14px;font-weight:bold">Save coupon to Apple Wallet</a><p style="font-size:12px;color:#64748b;margin:12px 0 0">Open on your iPhone to save it for your next banner.</p></td></tr></table>` : ""}<p style="font-size:15px;line-height:24px;margin:24px 0 0;color:#475569">A grand opening, a weekend event, or a fresh look for your business—we’re ready when you are. Upload your artwork, choose your size, and see your banner before ordering.</p><p style="font-size:15px;line-height:24px;color:#475569">Questions? Just reply. We’re happy to help.<br><strong style="color:#122641">The Banners On The Fly team</strong></p><p style="font-size:11px;line-height:18px;color:#64748b;margin:24px 0 0">${escape(TERMS)}</p></td></tr></table><p style="font-size:11px;color:#64748b;line-height:18px;margin:20px 8px 4px">Banners On The Fly · ${escape(address)}</p><p style="font-size:11px;margin:0"><a href="${escape(unsubscribe)}" style="color:#64748b">Unsubscribe from marketing emails</a></p></td></tr></table></body></html>`;
  return { subject, text, html };
}
async function sendInvitation(
  sql,
  lead,
  admin,
  send = (payload, key) =>
    new Resend(process.env.RESEND_API_KEY).emails.send(payload, {
      idempotencyKey: key,
    }),
) {
  const email = lead.email;
  const token = tokens.createMarketingUnsubscribeToken(email, CAMPAIGN);
  const unsubscribe = tokens.buildMarketingUnsubscribeUrl(token);
  const content = emailContent(lead, unsubscribe);
  const key = `louisville25/${lead.id}`;
  const stopped = await suppression.findEmailSuppression(sql, email);
  const state = stopped?.suppressed ? "suppressed" : "processing";
  // Retries keep the exact provider key and recipient payload. A 23-hour cutoff
  // prevents retries after the provider's 24-hour idempotency window.
  const claimed =
    await sql`INSERT INTO marketing_email_sends(campaign_key,normalized_email,recipient_email,recipient_name,subject,sending_admin_id,sending_admin_email,status,request_id,provider_idempotency_key,unsubscribe_token_hash)
    VALUES(${CAMPAIGN},${email},${email},${lead.name},${content.subject},${admin.sub || null},${admin.email || null},${state},${lead.id},${key},${tokens.hashMarketingUnsubscribeToken(token)})
    ON CONFLICT(campaign_key,normalized_email) DO UPDATE SET status=EXCLUDED.status,last_attempt_at=now(),updated_at=now(),attempt_count=marketing_email_sends.attempt_count+1
      WHERE marketing_email_sends.status IN ('error','processing') AND marketing_email_sends.last_attempt_at<now()-interval '5 minutes' AND marketing_email_sends.created_at>now()-interval '23 hours'
    RETURNING id`;
  if (stopped?.suppressed)
    return {
      id: lead.id,
      status: "suppressed",
      message: "Recipient has opted out or cannot receive marketing.",
    };
  if (!claimed.length)
    return {
      id: lead.id,
      status: "skipped",
      message: "Already sent, in progress, or awaiting delivery review.",
    };
  try {
    const result = await send(
      {
        from:
          process.env.EMAIL_FROM_INFO ||
          process.env.EMAIL_FROM ||
          "Banners On The Fly <info@bannersonthefly.com>",
        to: email,
        replyTo: "support@bannersonthefly.com",
        ...content,
        headers: {
          "List-Unsubscribe": `<${unsubscribe}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        tags: [{ name: "campaign", value: CAMPAIGN }],
      },
      key,
    );
    if (result.error || !result.data?.id)
      throw Error("Provider did not confirm delivery acceptance.");
    await sql`UPDATE marketing_email_sends SET status='sent',sent_at=now(),updated_at=now(),resend_message_id=${result.data.id},error_message=NULL WHERE id=${claimed[0].id}`;
    return { id: lead.id, status: "sent" };
  } catch {
    await sql`UPDATE marketing_email_sends SET status='error',updated_at=now(),error_message='Delivery was not confirmed. Retry after five minutes; contact support if more than 23 hours have passed.' WHERE id=${claimed[0].id} AND status='processing'`;
    return {
      id: lead.id,
      status: "error",
      message: "Delivery was not confirmed.",
    };
  }
}
module.exports = {
  CAMPAIGN,
  SITE,
  TERMS,
  CODE_PATTERN,
  ensureSchema,
  parseContacts,
  importContacts,
  emailContent,
  sendInvitation,
};
