'use strict';

const {
  normalizeName,
  renderEmailLayout,
  escapeHtml,
} = require('./legacy/email-template.cjs');

const REVIEW_URL = 'https://g.page/r/CeCPZSBbBNTHEAE/review';
const REVIEW_SUBJECT = 'We’d truly appreciate your feedback';
const REVIEW_PREVIEW_TEXT = 'Your review would mean a great deal to our growing online business.';
const ELIGIBLE_PAID_STATUSES = new Set(['paid', 'in_production', 'shipped', 'delivered', 'fulfilled']);
const INELIGIBLE_STATUSES = new Set(['pending', 'failed', 'canceled', 'cancelled', 'refunded']);

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidCustomerEmail(value) {
  const email = normalize(value);
  if (!email || email.length > 254 || /\s/.test(email)) return false;
  return /^[^@]+@[^@]+\.[^@]+$/.test(email);
}

function getCanonicalCustomerEmail(order = {}) {
  const candidates = [order.email, order.profile_email, order.user_email];
  return candidates.map(normalize).find(isValidCustomerEmail) || '';
}

function hasCanonicalPaidEvidence(order = {}) {
  const status = normalize(order.status);
  if (ELIGIBLE_PAID_STATUSES.has(status)) return true;

  const method = normalize(order.payment_method);
  const reconciliation = normalize(order.payment_reconciliation_status);
  return status === 'pending'
    && method === 'paypal'
    && Boolean(order.paypal_capture_id)
    && (reconciliation === 'complete' || reconciliation === 'completed');
}

function getReviewRequestEligibility(order = {}) {
  const paymentMethod = normalize(order.payment_method);
  if (order.is_test_order === true || paymentMethod === 'admin_deploy_preview_test') {
    return { eligible: false, code: 'TEST_ORDER', reason: 'Review requests cannot be sent for test orders.' };
  }

  const customerEmail = getCanonicalCustomerEmail(order);
  if (!customerEmail) {
    return { eligible: false, code: 'INVALID_CUSTOMER_EMAIL', reason: 'No valid customer email is available for this order.' };
  }

  const status = normalize(order.status);
  if (INELIGIBLE_STATUSES.has(status) && !hasCanonicalPaidEvidence(order)) {
    return { eligible: false, code: 'ORDER_NOT_PAID', reason: 'This order is not eligible because it is not a confirmed paid order.' };
  }

  if (!hasCanonicalPaidEvidence(order)) {
    return { eligible: false, code: 'ORDER_NOT_PAID', reason: 'This order is not eligible because it is not a confirmed paid order.' };
  }

  return { eligible: true, code: 'ELIGIBLE', reason: '', customerEmail };
}

function getCustomerFirstName(order = {}) {
  return normalizeName(
    order.customer_first_name
      || order.customer_name
      || order.shipping_name
      || order.profile_full_name
      || order.full_name
      || '',
  ).firstName;
}

function buildReviewRequestHtml(order = {}) {
  const firstName = getCustomerFirstName(order);
  const preheader = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(REVIEW_PREVIEW_TEXT)}</div>`;
  const layout = renderEmailLayout({
    title: 'We’d Truly Appreciate Your Feedback',
    subtitle: 'Your honest feedback helps our online business grow.',
    eyebrow: 'A Personal Thank-You',
    bodyHtml: `
      <p style="margin:0 0 14px;font-size:15px;color:#334155;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#334155;">Thank you again for choosing Banners on the Fly. We truly appreciate your business and hope you were happy with your order and your experience with us.</p>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#334155;">Although we have been in business for years, our online presence is still relatively new. Every customer review helps people discover our business and gives future customers greater confidence when ordering from us.</p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:#334155;">We would be incredibly grateful if you would take a moment to leave us an honest Google review:</p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 16px;">
        <tr><td align="center">
          <a href="${escapeHtml(REVIEW_URL)}" style="display:inline-block;background:#ff6b35;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:8px;font-weight:700;font-size:15px;line-height:1.2;">Leave a Google Review</a>
        </td></tr>
      </table>
      <p style="margin:0 0 18px;text-align:center;font-size:12px;line-height:1.5;color:#64748b;word-break:break-all;">If the button does not work, use this link:<br><a href="${escapeHtml(REVIEW_URL)}" style="color:#18448D;text-decoration:underline;">${escapeHtml(REVIEW_URL)}</a></p>
      <div style="margin:0 0 16px;padding:14px 16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
        <p style="margin:0;font-size:14px;line-height:1.6;color:#9a3412;"><strong>As a thank-you:</strong> once we manually see your review, we will send you a coupon code for <strong>25% off your next order</strong>.</p>
      </div>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#334155;">Your feedback genuinely means a lot to us and helps our business continue to grow.</p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:#334155;">Thank you again for trusting Banners on the Fly.</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">With appreciation,<br><strong>The Banners on the Fly Team</strong></p>
    `,
  });

  return layout.replace(/(<body[^>]*>)/i, `$1${preheader}`);
}

function buildReviewRequestText(order = {}) {
  const firstName = getCustomerFirstName(order);
  return [
    `Hi ${firstName},`,
    '',
    'Thank you again for choosing Banners on the Fly. We truly appreciate your business and hope you were happy with your order and your experience with us.',
    '',
    'Although we have been in business for years, our online presence is still relatively new. Every customer review helps people discover our business and gives future customers greater confidence when ordering from us.',
    '',
    'We would be incredibly grateful if you would take a moment to leave us an honest Google review:',
    REVIEW_URL,
    '',
    'As a thank-you, once we manually see your review, we will send you a coupon code for 25% off your next order.',
    '',
    'Your feedback genuinely means a lot to us and helps our business continue to grow.',
    '',
    'Thank you again for trusting Banners on the Fly.',
    '',
    'With appreciation,',
    'The Banners on the Fly Team',
    '',
    'Questions? Reply to this email or contact support@bannersonthefly.com',
  ].join('\n');
}

function createReviewRequestEmailData({ order, customerEmail, from, replyTo, action = 'initial', coupon = null }) {
  if (action === 'followup') return createFollowupEmail({ order, customerEmail, from, replyTo });
  if (action === 'coupon') return createCouponEmail({ order, customerEmail, from, replyTo, coupon });
  return {
    from,
    to: customerEmail,
    replyTo,
    subject: REVIEW_SUBJECT,
    html: buildReviewRequestHtml(order),
    text: buildReviewRequestText(order),
    tags: [
      { name: 'type', value: 'review_request' },
      { name: 'order_id', value: String(order.id) },
    ],
  };
}

module.exports = {
  REVIEW_URL,
  REVIEW_SUBJECT,
  REVIEW_PREVIEW_TEXT,
  isValidCustomerEmail,
  getCanonicalCustomerEmail,
  hasCanonicalPaidEvidence,
  getReviewRequestEligibility,
  getCustomerFirstName,
  buildReviewRequestHtml,
  buildReviewRequestText,
  createReviewRequestEmailData,
};


function createFollowupEmail({ order, customerEmail, from, replyTo }) {
  const firstName = getCustomerFirstName(order);
  const paragraphs = [
    `Hi ${firstName},`,
    'We know life gets busy, so we wanted to send one gentle follow-up. Thank you again for choosing Banners on the Fly — your business means so much to us.',
    'If you have a moment, would you share your honest experience in a Google review? A few words from customers like you help others feel confident ordering from our small business.',
    'As an extra thank-you, we have increased our earlier offer from 25% to 30% off your next order. Once we manually verify your review, we will email your personal, one-time-use coupon code. No particular rating is required — we appreciate your honest feedback.',
    'If you have already left a review, thank you! You can reply with the name shown on your review so we can find it and send your coupon.',
    'We truly appreciate your time and the opportunity to print for you. If there is anything we can help with, just reply — we are happy to help.',
    'With appreciation,',
    'The Banners on the Fly Team',
  ];
  const button = `<p style="text-align:center;margin:24px 0;"><a href="${escapeHtml(REVIEW_URL)}" style="display:inline-block;background:#ff6b35;color:#fff;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:700;">Share Your Experience</a></p>`;
  return {
    from, to: customerEmail, replyTo,
    subject: 'A gentle follow-up, and an extra thank-you from us',
    html: renderEmailLayout({
      title: 'A Little Reminder. A Big Thank-You.',
      subtitle: 'We would love to hear about your experience.',
      eyebrow: 'With Appreciation',
      bodyHtml: paragraphs.map((text, index) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#334155;">${escapeHtml(text)}</p>${index === 2 ? button : ''}`).join('')
        + `<p style="font-size:12px;word-break:break-all;">Review link: <a href="${escapeHtml(REVIEW_URL)}">${escapeHtml(REVIEW_URL)}</a></p>`,
    }),
    text: [...paragraphs.slice(0, 3), REVIEW_URL, ...paragraphs.slice(3)].join('\n\n'),
    tags: [{ name: 'type', value: 'review_followup' }, { name: 'order_id', value: String(order.id) }],
  };
}

function createCouponEmail({ order, customerEmail, from, replyTo, coupon }) {
  const percentage = Number(coupon?.offer_percentage);
  if (![25, 30].includes(percentage) || !coupon?.code) throw new Error('Invalid review coupon');
  const name = getCustomerFirstName(order);
  const text = `Hi ${name},\n\nThank you for taking the time to share your experience with Banners on the Fly. Your feedback and support mean a great deal to our small business.\n\nAs promised, here is your personal ${percentage}% off coupon for your next order:\n\n${coupon.code}\n\nEnter this code in the discount-code field at checkout using ${customerEmail}. It is valid for one order and cannot be combined with another promotional code. The discount applies to your order subtotal before tax and shipping.\n\nOrder again: https://bannersonthefly.com\n\nWe truly appreciate your business and look forward to printing for you again!\n\nWith appreciation,\nThe Banners on the Fly Team\n\nQuestions? Reply to this email and we will be happy to help.`;
  return {
    from, to: customerEmail, replyTo,
    subject: `With thanks — your personal ${percentage}% off code is here`,
    text,
    html: renderEmailLayout({
      title: `Your ${percentage}% Off Thank-You Is Here`,
      subtitle: 'We appreciate your feedback and your business.',
      eyebrow: 'Thank You',
      bodyHtml: `<p style="font-size:15px;line-height:1.65;">Hi ${escapeHtml(name)},</p>
        <p style="font-size:15px;line-height:1.65;">Thank you for taking the time to share your experience with Banners on the Fly. Your feedback and support mean a great deal to our small business.</p>
        <p style="font-size:15px;line-height:1.65;">As promised, enjoy <strong>${percentage}% off your next order</strong> with your personal code:</p>
        <div style="margin:24px 0;padding:20px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;text-align:center;"><strong style="font-size:21px;word-break:break-all;">${escapeHtml(coupon.code)}</strong></div>
        <p style="font-size:14px;line-height:1.65;">Enter this code at checkout using <strong style="word-break:break-all;">${escapeHtml(customerEmail)}</strong>. Valid for one order; cannot be combined with another promotional code. Applies to the order subtotal before tax and shipping.</p>
        <p style="text-align:center;margin:24px 0;"><a href="https://bannersonthefly.com" style="display:inline-block;background:#ff6b35;color:#fff;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:700;">Start Your Next Order</a></p>
        <p style="font-size:15px;line-height:1.65;">We truly appreciate your business and look forward to printing for you again! If you need anything, just reply to this email.</p>
        <p style="font-size:15px;line-height:1.65;">With appreciation,<br><strong>The Banners on the Fly Team</strong></p>`,
    }),
    tags: [{ name: 'type', value: 'review_coupon' }, { name: 'order_id', value: String(order.id) }],
  };
}
