"use strict";
const { Resend } = require("resend");
const auth = require("./server-auth.cjs");
const { siteOrigin } = require("./bof-email.cjs");
const suppression = require("./email-suppression.cjs");

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function content({ amountCents, kind }) {
  if (
    ![500, 1000].includes(Number(amountCents)) ||
    !["earned", "available"].includes(kind)
  )
    throw new Error("Invalid BOF reward notification");
  const amount = `$${(Number(amountCents) / 100).toFixed(2)}`;
  const available = kind === "available";
  const subject = available
    ? `Your ${amount} BOF Cash is ready to use`
    : `You earned ${amount} in BOF Cash!`;
  const message = available
    ? `The ${amount} BOF Cash reward from your referral is now available in your wallet.`
    : `Someone you referred placed a qualifying order! You earned ${amount} in BOF Cash, and it has been added to your pending rewards.`;
  const timing = available
    ? "Sign in to see your current available balance. Earned credits never expire."
    : "Your reward becomes available 14 days after the order ships, subject to payment verification. We'll email you again when it is ready to use. Refunds or cancellations may reverse the reward.";
  const terms =
    "Use available BOF Cash on $50+ in eligible merchandise, covering up to 25% of banners and yard signs or 15% of car magnets. Offers do not stack. Product eligibility and margin safeguards apply. Tax, shipping and excluded services are not covered. BOF Cash has no cash value.";
  const link = `${siteOrigin()}/bof-cash`;
  return {
    subject,
    text: `${subject}\n\n${message}\n\n${timing}\n\nView my BOF Cash: ${link}\n\n${terms}\n\nQuestions? support@bannersonthefly.com`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#122641"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:white;border-radius:12px"><tr><td style="padding:28px"><img src="${siteOrigin()}/images/header-logo.png" width="220" alt="Banners On The Fly" style="max-width:100%;height:auto"><p style="font-size:12px;letter-spacing:2px;color:#a33f00;margin-top:30px">BOF CASH · ${available ? "READY TO USE" : "REWARD EARNED"}</p><h1 style="font-size:30px;line-height:36px">${escape(subject)}</h1><p style="font-size:16px;line-height:25px">${escape(message)}</p><p style="font-size:15px;line-height:24px;color:#475569">${escape(timing)}</p><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#c94e00" style="background:#c94e00;border-radius:7px;mso-padding-alt:16px 22px"><a href="${escape(link)}" style="display:block;padding:16px 22px;color:white;font-weight:bold;text-decoration:none">View my BOF Cash &rarr;</a></td></tr></table><p style="font-size:12px;line-height:19px;color:#64748b;margin-top:28px">${escape(terms)}</p><p style="font-size:13px"><a href="mailto:support@bannersonthefly.com">Questions? Contact BOF</a></p></td></tr></table></td></tr></table></body></html>`,
  };
}

// An additive, lazily initialized outbox, matching the existing email-store
// pattern. No deployment-time credential or manual database migration needed.
async function ensureSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS bof_reward_email_sends (
    order_id uuid NOT NULL REFERENCES orders(id),
    kind text NOT NULL CHECK(kind IN ('earned','available')),
    member_id uuid NOT NULL REFERENCES bof_members(user_id),
    status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','sent','error','suppressed','cancelled','review')),
    payload jsonb,
    provider_id text,
    first_attempt_at timestamptz,
    last_attempt_at timestamptz,
    sent_at timestamptz,
    attempts integer NOT NULL DEFAULT 0,
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(order_id,kind)
  )`;
}

async function dispatch(sql, { orderId = null } = {}) {
  if (
    auth.isDeployPreviewEnvironment({}) ||
    !(
      process.env.BOF_REFERRAL_ENABLED === "true" ||
      process.env.BOF_REFERRAL_LAUNCHED_AT
    )
  )
    return { sent: 0, inactive: true };
  await ensureSchema(sql);
  // Read only actual, positive ledger rewards. Never infer earnings from a
  // coupon attempt, click, pending payment, test order or refund event.
  await sql`INSERT INTO bof_reward_email_sends(order_id,kind,member_id)
    SELECT e.order_id,k.kind,e.member_id FROM bof_cash_entries e
    JOIN bof_order_benefits b ON b.order_id=e.order_id
    JOIN orders o ON o.id=e.order_id
    JOIN bof_members m ON m.user_id=e.member_id
    CROSS JOIN (VALUES ('earned'),('available')) k(kind)
    WHERE e.kind='reward' AND e.amount_cents IN (500,1000)
      AND b.state='paid' AND b.reward_eligible AND m.enabled
      AND o.status IN ('paid','in_production','shipped','delivered','fulfilled')
      AND NOT coalesce(o.is_test_order,false)
      AND (${orderId}::uuid IS NULL OR e.order_id=${orderId}::uuid)
      AND ((k.kind='earned' AND (e.available_at IS NULL OR e.available_at>now()))
        OR (k.kind='available' AND e.available_at<=now()))
    ON CONFLICT(order_id,kind) DO NOTHING`;
  // Never retry an ambiguous send outside Resend's 24-hour idempotency window.
  await sql`UPDATE bof_reward_email_sends SET status='review',error_code='IDEMPOTENCY_WINDOW_EXPIRED'
    WHERE status IN ('processing','error') AND first_attempt_at<=now()-interval '23 hours'`;
  const candidates = await sql`SELECT order_id,kind FROM bof_reward_email_sends
    WHERE (${orderId}::uuid IS NULL OR order_id=${orderId}::uuid)
      AND (status='queued' OR (status IN ('processing','error') AND last_attempt_at<now()-interval '5 minutes'))
    ORDER BY coalesce(last_attempt_at,'-infinity'::timestamptz),created_at LIMIT 20`;
  let sent = 0;
  for (const candidate of candidates) {
    const rows =
      await sql`UPDATE bof_reward_email_sends SET status='processing',
      first_attempt_at=coalesce(first_attempt_at,now()),last_attempt_at=now(),attempts=attempts+1
      WHERE order_id=${candidate.order_id}::uuid AND kind=${candidate.kind}
      AND (status='queued' OR (status IN ('processing','error') AND last_attempt_at<now()-interval '5 minutes'
        AND first_attempt_at>now()-interval '23 hours')) RETURNING *`;
    if (!rows.length) continue;
    const row = rows[0];
    try {
      const eligible =
        await sql`SELECT p.email,e.amount_cents FROM bof_cash_entries e
        JOIN bof_order_benefits b ON b.order_id=e.order_id JOIN orders o ON o.id=e.order_id
        JOIN bof_members m ON m.user_id=e.member_id JOIN profiles p ON p.id=m.user_id
        WHERE e.order_id=${row.order_id}::uuid AND e.member_id=${row.member_id}::uuid AND e.kind='reward'
          AND e.amount_cents IN (500,1000) AND b.state='paid' AND b.reward_eligible AND m.enabled AND p.email_verified
          AND o.status IN ('paid','in_production','shipped','delivered','fulfilled') AND NOT coalesce(o.is_test_order,false)
          AND ((${row.kind}='earned' AND (e.available_at IS NULL OR e.available_at>now()))
            OR (${row.kind}='available' AND e.available_at<=now()))
          AND NOT EXISTS (SELECT 1 FROM bof_cash_entries r WHERE r.order_id=e.order_id AND r.kind='reward_reversal')`;
      if (!eligible.length) {
        await sql`UPDATE bof_reward_email_sends SET status='cancelled' WHERE order_id=${row.order_id}::uuid AND kind=${row.kind}`;
        continue;
      }
      const reward = eligible[0];
      const to = String(reward.email || "")
        .trim()
        .toLowerCase();
      const stop = await suppression.findEmailSuppression(sql, to);
      // This is an account balance update, like a secure sign-in email.
      // Marketing opt-outs do not block it; bounce/complaint/legal blocks do.
      if (
        stop?.suppressed &&
        ![
          "unsubscribe",
          "unsubscribed",
          "newsletter_unsubscribed",
          "consent_declined",
        ].includes(stop.reason)
      ) {
        await sql`UPDATE bof_reward_email_sends SET status='suppressed',error_code=${stop.reason} WHERE order_id=${row.order_id}::uuid AND kind=${row.kind}`;
        continue;
      }
      const payload = row.payload || {
        from:
          process.env.EMAIL_FROM_INFO ||
          process.env.EMAIL_FROM ||
          "Banners On The Fly <info@bannersonthefly.com>",
        to,
        replyTo: "support@bannersonthefly.com",
        ...content({
          amountCents: Number(reward.amount_cents),
          kind: row.kind,
        }),
      };
      // Changing recipient or template on a retry would invalidate provider
      // idempotency. Preserve the exact payload, and stop on account changes.
      if (payload.to !== to) {
        await sql`UPDATE bof_reward_email_sends SET status='review',error_code='RECIPIENT_CHANGED' WHERE order_id=${row.order_id}::uuid AND kind=${row.kind}`;
        continue;
      }
      if (!row.payload)
        await sql`UPDATE bof_reward_email_sends SET payload=${JSON.stringify(payload)}::jsonb WHERE order_id=${row.order_id}::uuid AND kind=${row.kind}`;
      const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
        payload,
        {
          idempotencyKey: `bof-reward/${row.kind}/${row.order_id}`,
        },
      );
      if (result.error || !result.data?.id)
        throw Object.assign(new Error("Reward email failed"), {
          code: result.error?.name || "PROVIDER_ERROR",
        });
      await sql`UPDATE bof_reward_email_sends SET status='sent',provider_id=${result.data.id},sent_at=now(),error_code=NULL WHERE order_id=${row.order_id}::uuid AND kind=${row.kind}`;
      sent++;
    } catch (error) {
      await sql`UPDATE bof_reward_email_sends SET status='error',error_code=${String(error.code || "SEND_FAILED").slice(0, 100)} WHERE order_id=${row.order_id}::uuid AND kind=${row.kind}`;
      console.error("[bof-reward-email] retry queued", {
        orderId: row.order_id,
        kind: row.kind,
        code: error.code || "SEND_FAILED",
      });
    }
  }
  return { sent };
}
async function dispatchSafely(sql, options) {
  try {
    return await dispatch(sql, options);
  } catch (error) {
    console.error("[bof-reward-email] maintenance retry required", {
      code: error.code || "DISPATCH_FAILED",
    });
    return { sent: 0, error: true };
  }
}
module.exports = { content, ensureSchema, dispatch, dispatchSafely };
