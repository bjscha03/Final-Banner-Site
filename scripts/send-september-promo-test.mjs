import crypto from 'node:crypto';
import { Resend } from 'resend';
import marketingToken from '../netlify/functions/_shared/marketing-email-token.cjs';
import marketingStore from '../netlify/functions/_shared/marketing-email-store.cjs';
import { buildSeptemberPromoEmail } from '../src/lib/marketing/septemberPromoEmail.mjs';

const recipient = String(process.argv[2] || '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
  throw new Error('Usage: node scripts/send-september-promo-test.mjs recipient@example.com');
}
if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured');

const token = marketingToken.createMarketingUnsubscribeToken(
  recipient,
  marketingStore.SEPTEMBER_PROMO_CAMPAIGN_KEY,
);
const unsubscribeUrl = marketingToken.buildMarketingUnsubscribeUrl(token);
const physicalAddress = process.env.MARKETING_PHYSICAL_ADDRESS
  || process.env.OUTBOUND_PHYSICAL_ADDRESS
  || process.env.RECOVERY_PHYSICAL_ADDRESS
  || 'PO Box 369, Crestwood, KY 40014';
const email = buildSeptemberPromoEmail({ unsubscribeUrl, physicalAddress });
const fromRaw = process.env.SEPTEMBER_PROMO_FROM
  || process.env.EMAIL_FROM_INFO
  || process.env.EMAIL_FROM
  || 'info@bannersonthefly.com';
const from = fromRaw.includes('<') ? fromRaw : `Banners On The Fly <${fromRaw}>`;
const replyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';
const templateDigest = crypto.createHash('sha256')
  .update(`${recipient}\0${email.subject}\0${email.html}`)
  .digest('hex')
  .slice(0, 40);

const resend = new Resend(process.env.RESEND_API_KEY);
const result = await resend.emails.send({
  from,
  to: recipient,
  replyTo,
  subject: email.subject,
  html: email.html,
  text: email.text,
  headers: {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  },
  tags: [
    { name: 'type', value: 'customer_promotion_test' },
    { name: 'campaign', value: marketingStore.SEPTEMBER_PROMO_CAMPAIGN_KEY },
  ],
}, {
  idempotencyKey: `bof-september-promo-test/${templateDigest}`,
  signal: AbortSignal.timeout(15_000),
});

if (result?.error || !result?.data?.id) throw result?.error || new Error('Resend did not return a message ID');
console.log(JSON.stringify({
  ok: true,
  recipient,
  subject: email.subject,
  messageId: result.data.id,
}, null, 2));
