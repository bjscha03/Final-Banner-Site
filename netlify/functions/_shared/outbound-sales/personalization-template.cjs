'use strict';

const SITE_URL = 'https://bannersonthefly.com';
const DESIGN_URL = `${SITE_URL}/design?utm_source=email&utm_medium=marketing&utm_campaign=company_intro_new20`;
const LIVE_DELIVERY_URL = `${SITE_URL}/shipping?utm_source=email&utm_medium=marketing&utm_campaign=company_intro_new20`;
const BRAND_LOGO_URL = `${SITE_URL}/images/header-logo.png`;
// Use the same direct Cloudinary delivery domain as the site's established
// transactional email imagery. The immutable Git commit keeps this asset
// available before and after the preview branch is merged or removed.
const HERO_IMAGE_URL = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_1280/https://raw.githubusercontent.com/bjscha03/Final-Banner-Site/0c2c37625cf645b3a8de526c02e57e35f5096bfe/public/images/email/trade-show-booth-hero.webp';
const BRAND_ORANGE = '#ff6b35';
const BRAND_ORANGE_DARK = '#d94f16';
const BRAND_NAVY = '#18448D';
const BRAND_NAVY_DARK = '#0b2344';
const FIRST_ORDER_PROMO_CODE = 'NEW20';
const LEGACY_SIGNATURE = 'Best,\nBrandon\nBanners On The Fly';
const SIGNATURE = 'Best,\nBrandon Schaefer\nOwner, Banners On The Fly\nbannersonthefly.com';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function splitBodyAndSignature(bodyText) {
  const normalized = String(bodyText || '').trim();
  const matched = [SIGNATURE, LEGACY_SIGNATURE].find((signature) => normalized.endsWith(signature));
  if (!matched) return { message: normalized, signature: '' };
  return { message: normalized.slice(0, -matched.length).trim(), signature: SIGNATURE };
}

function polishOutboundSubject(subject) {
  return String(subject || '')
    .replace(/^\s*(?:a|your)\s+quick banner mockup\s+for\s+(.+)$/i, '$1 — custom banner printing')
    .replace(/^(.{2,100}?)\s+(?:[—:\-]\s*)?(?:a\s+)?quick banner mockup(?:\s+using your brand)?\s*$/i, '$1 — custom banner printing')
    .replace(/^\s*your\s+(?:complimentary banner (?:design|concept)|custom banner concept)\b/i, 'Custom banner printing')
    .replace(/^(.{2,100}?)\s+(?:[—:\-]\s*)?(?:a\s+)?(?:complimentary banner (?:design|concept)|custom banner concept)\b/i, '$1 — custom banner printing')
    .replace(/\b(?:a\s+)?quick banner mockup\b/gi, 'custom banner printing')
    .replace(/\b(?:a\s+)?(?:complimentary banner (?:design|concept)|custom banner concept)\b/gi, 'custom banner printing')
    .replace(/\s+using your brand\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function polishOutboundBodyText(bodyText) {
  const { message } = splitBodyAndSignature(bodyText);
  const directNextStep = 'Use code NEW20 to save 20% on your first order whenever you’re ready.';
  let offerSeen = false;
  const polished = message
    .replace(/[^\n.!?]*\bmockup\b[^\n.!?]*(?:[.!?]|$)/gi, '')
    .replace(/\s*I put together a complimentary banner concept using .+?(?:'|’)?s public branding so you can see how the brand could look on a professionally printed display\.?/gi, '')
    .replace(/\s*This is just a quick mockup using .+?(?:'|’)?s public branding to show one way the brand could look on a printed banner\.?/gi, '')
    .replace(/\s*(?:Your|The) (?:complimentary banner (?:design|concept)|custom banner concept) is attached\.?/gi, '')
    .replace(/\s*(?:The image above is|This is) (?:only )?(?:a )?quick mockup[^.?!]*(?:[.?!]|$)/gi, '')
    .replace(/\s*(?:Your|The) (?:quick )?(?:banner )?mockup is attached\.?/gi, '')
    .replace(/\b(?:a\s+)?quick banner mockup\b/gi, 'banner printing')
    .replace(/\b(?:a\s+)?(?:complimentary banner (?:design|concept)|custom banner concept)\b/gi, 'banner printing')
    .replace(/Would it be useful if I priced a show banner for booth [^?]+\?/gi, directNextStep)
    .replace(/Would a quick quote for a booth-width banner be helpful\?/gi, directNextStep)
    .replace(/Would it help if I priced a booth banner for [^?]+\?/gi, directNextStep)
    .replace(/You can design and price your banner online whenever you(?:'|’)re ready, or reply with the size and quantity for quick pricing\.?/gi, directNextStep)
    .replace(/Reply with (?:the |your )?(?:approximate )?(?:banner )?(?:size|dimensions?)(?: and |, ?)(?:the )?quantit(?:y|ies)[^.?!]*(?:[.?!]|$)/gi, directNextStep)
    .replace(/(?:For your first order,\s*)?Use code NEW20 to save 20%(?: on your first order)?(?: whenever you(?:'|’)re ready)?\.?/gi, () => {
      if (offerSeen) return '';
      offerSeen = true;
      return directNextStep;
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return [polished, SIGNATURE].filter(Boolean).join('\n\n');
}

function paragraphs(bodyText) {
  return String(bodyText || '').split(/\n{2,}/).map((paragraph) => {
    const lines = paragraph.split(/\n/).map(escapeHtml).join('<br>');
    return `<p style="margin:0 0 17px;color:#334155;font-size:16px;line-height:1.68;">${lines}</p>`;
  }).join('');
}

function signatureBlock(signature) {
  if (!signature) return '';
  const lines = String(signature).split(/\n/).map(escapeHtml);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:24px 0 0;border-collapse:separate;border-left:4px solid ${BRAND_ORANGE};border-radius:10px;background:#f8fbff;"><tr><td style="padding:15px 17px;color:#334155;font-size:14px;line-height:1.55;">${lines[0] || ''}<br><strong style="color:${BRAND_NAVY_DARK};font-size:16px;">${lines[1] || ''}</strong><br><span style="color:#52657d;">${lines[2] || ''}</span><br><a href="${SITE_URL}" style="color:${BRAND_NAVY};font-weight:700;text-decoration:none;">${lines[3] || 'bannersonthefly.com'}</a></td></tr></table>`;
}

function deliveryPromiseStrip() {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:${BRAND_NAVY_DARK};">
    <tr>
      <td width="33.33%" valign="top" style="width:33.33%;padding:16px 13px;border-right:1px solid #29415e;">
        <p style="margin:0 0 6px;color:${BRAND_ORANGE};font-size:10px;font-weight:900;letter-spacing:1px;text-transform:uppercase;">Order cutoff</p>
        <p style="margin:0;color:#ffffff;font-size:15px;line-height:1.25;font-weight:800;">10 PM ET</p>
      </td>
      <td width="33.33%" valign="top" style="width:33.33%;padding:16px 13px;border-right:1px solid #29415e;">
        <p style="margin:0 0 6px;color:${BRAND_ORANGE};font-size:10px;font-weight:900;letter-spacing:1px;text-transform:uppercase;">Production</p>
        <p style="margin:0;color:#ffffff;font-size:15px;line-height:1.25;font-weight:800;">Most in 24 hours</p>
      </td>
      <td width="33.33%" valign="top" style="width:33.33%;padding:16px 13px;">
        <p style="margin:0 0 6px;color:${BRAND_ORANGE};font-size:10px;font-weight:900;letter-spacing:1px;text-transform:uppercase;">Shipping</p>
        <p style="margin:0;color:#ffffff;font-size:15px;line-height:1.25;font-weight:800;">Free Next-Day Air</p>
      </td>
    </tr>
    <tr><td colspan="3" align="center" style="padding:0 13px 14px;color:#dbe7f6;font-size:12px;line-height:1.5;">
      <a href="${LIVE_DELIVERY_URL}" style="color:#ffffff;font-weight:800;text-decoration:underline;">See today&rsquo;s live ship &amp; delivery estimate</a>
    </td></tr>
  </table>`;
}

function complianceFooter({ physicalAddress, unsubscribeUrl } = {}) {
  if (!physicalAddress || !unsubscribeUrl) return '';
  return `<p style="margin:13px 0 0;color:#718096;font-size:11px;line-height:1.65;">${escapeHtml(physicalAddress)}<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:${BRAND_NAVY};text-decoration:underline;">Unsubscribe from future marketing emails</a></p>`;
}

function renderOutboundEmailPreview({
  subject, bodyText, physicalAddress, unsubscribeUrl,
  mockupImageSrc, mockupAlt, businessName,
}) {
  const { message, signature } = splitBodyAndSignature(polishOutboundBodyText(bodyText));
  const safeSubject = escapeHtml(polishOutboundSubject(subject));
  const hasConceptImage = Boolean(mockupImageSrc);
  const heroImageSrc = escapeHtml(mockupImageSrc || HERO_IMAGE_URL);
  const company = String(businessName || '').trim();
  const heroAlt = escapeHtml(mockupAlt || (company
    ? `Banner concept for ${company}`
    : 'A trade show exhibitor booth using a professionally printed custom vinyl banner'));

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${safeSubject}</title></head>
<body style="margin:0;padding:0;background:#edf2f7;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Premium custom banners, fast production, free Next-Day Air shipping, and 20% off your first order with ${FIRST_ORDER_PROMO_CODE}.</div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="width:100%;background:#edf2f7;">
    <tr><td align="center" style="padding:24px 10px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="width:100%;max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(11,35,68,.14);">
        <tr><td style="height:7px;background:${BRAND_ORANGE};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td align="center" style="padding:22px 30px;background:#ffffff;">
          <a href="${SITE_URL}" style="text-decoration:none;"><img src="${BRAND_LOGO_URL}" alt="Banners On The Fly" width="240" style="display:block;width:240px;max-width:100%;height:auto;margin:0 auto;border:0;"></a>
        </td></tr>
        <tr><td style="padding:0;background:${BRAND_NAVY_DARK};">
          <img src="${heroImageSrc}" alt="${heroAlt}" width="640" style="display:block;width:100%;max-width:640px;height:auto;border:0;">
        </td></tr>
        ${hasConceptImage ? `<tr><td align="center" style="padding:7px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:10px;line-height:1.45;font-weight:600;letter-spacing:.2px;">Concept visualization only.</td></tr>` : ''}
        <tr><td style="padding:30px 34px 28px;background:${BRAND_NAVY_DARK};text-align:center;">
          <p style="margin:0 0 10px;color:#ffb08c;font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;">Professional custom printing for businesses</p>
          <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.2;font-weight:900;">Big visibility. Fast turnaround.</h1>
          <p style="margin:12px auto 0;max-width:510px;color:#dbe7f6;font-size:16px;line-height:1.55;">Premium banners, signs, and magnets made to help your next promotion, opening, event, or everyday message stand out.</p>
        </td></tr>
        <tr><td style="padding:0;background:${BRAND_NAVY_DARK};border-top:1px solid #29415e;">
          ${deliveryPromiseStrip()}
        </td></tr>
        <tr><td style="padding:32px 34px 12px;background:#ffffff;">
          ${paragraphs(message)}
        </td></tr>
        <tr><td style="padding:8px 34px 26px;background:#ffffff;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border:1px solid #dbe5f1;border-radius:14px;background:#f8fbff;">
            <tr><td style="padding:18px 20px 8px;color:${BRAND_NAVY};font-size:12px;font-weight:900;letter-spacing:1px;text-transform:uppercase;">Why businesses order from us</td></tr>
            <tr><td style="padding:0 20px 18px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr><td width="30" valign="top" style="padding:7px 0;color:${BRAND_ORANGE};font-size:18px;font-weight:900;">✓</td><td style="padding:7px 0;color:#26364d;font-size:15px;line-height:1.45;"><strong>Most standard orders produced in 24 hours</strong></td></tr>
                <tr><td width="30" valign="top" style="padding:7px 0;color:${BRAND_ORANGE};font-size:18px;font-weight:900;">✓</td><td style="padding:7px 0;color:#26364d;font-size:15px;line-height:1.45;"><strong>Free Next-Day Air shipping after production</strong></td></tr>
                <tr><td width="30" valign="top" style="padding:7px 0;color:${BRAND_ORANGE};font-size:18px;font-weight:900;">✓</td><td style="padding:7px 0;color:#26364d;font-size:15px;line-height:1.45;"><strong>Premium vinyl, mesh, yard signs, and car magnets</strong></td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 34px 28px;background:#ffffff;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border:2px dashed ${BRAND_ORANGE};border-radius:14px;background:#fff7f2;">
            <tr><td align="center" style="padding:21px 20px;">
              <p style="margin:0;color:${BRAND_ORANGE_DARK};font-size:12px;font-weight:900;letter-spacing:1.1px;text-transform:uppercase;">Your first order offer</p>
              <p style="margin:6px 0 0;color:${BRAND_NAVY_DARK};font-size:27px;line-height:1.2;font-weight:900;">Save 20% with code <span style="color:${BRAND_ORANGE_DARK};white-space:nowrap;">${FIRST_ORDER_PROMO_CODE}</span></p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:0 34px 10px;background:#ffffff;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
            <tr><td bgcolor="${BRAND_ORANGE}" style="border-radius:10px;box-shadow:0 5px 12px rgba(217,79,22,.24);">
              <a href="${DESIGN_URL}" style="display:inline-block;padding:16px 28px;color:#ffffff;text-decoration:none;font-size:16px;line-height:1;font-weight:900;">Design &amp; Price Your Banner&nbsp; →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:8px 34px 31px;background:#ffffff;">
          ${signatureBlock(signature)}
          <p style="margin:22px 0 0;color:#718096;font-size:11px;line-height:1.6;">*Most standard orders are produced within 24 hours. Free Next-Day Air begins after production. Timing may vary based on artwork, order size, weekends, holidays, destination, and carrier conditions. First-order offer is subject to eligibility; promotions do not stack, and the best available discount applies.</p>
        </td></tr>
        <tr><td align="center" style="padding:22px 30px;background:#f5f8fc;border-top:1px solid #dbe5f1;">
          <p style="margin:0;color:#334155;font-size:12px;line-height:1.6;font-weight:800;">Banners On The Fly · Premium custom printing, delivered fast</p>
          <p style="margin:5px 0 0;color:#64748b;font-size:11px;line-height:1.6;">Vinyl Banners · Mesh Banners · Yard Signs · Car Magnets</p>
          <p style="margin:8px 0 0;font-size:11px;line-height:1.6;"><a href="${SITE_URL}" style="color:${BRAND_NAVY};font-weight:700;text-decoration:none;">bannersonthefly.com</a></p>
          ${complianceFooter({ physicalAddress, unsubscribeUrl })}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderOutboundDeliveryContent({
  subject, bodyText, physicalAddress, unsubscribeUrl,
  mockupImageSrc, mockupAlt, businessName,
}) {
  const { message, signature } = splitBodyAndSignature(polishOutboundBodyText(bodyText));
  const complianceText = `\n\n—\nBanners On The Fly\n${String(physicalAddress).trim()}\nUnsubscribe: ${String(unsubscribeUrl).trim()}`;
  const marketingText = [
    message,
    `ORDER CUTOFF: 10 PM ET | PRODUCTION: Most in 24 hours | SHIPPING: Free Next-Day Air\nSee today's live ship and delivery estimate: ${LIVE_DELIVERY_URL}`,
    'WHY BUSINESSES ORDER FROM US',
    '• Most standard orders produced in 24 hours',
    '• Free Next-Day Air shipping after production',
    '• Premium vinyl, mesh, yard signs, and car magnets',
    `FIRST ORDER OFFER: Save 20% with code ${FIRST_ORDER_PROMO_CODE}`,
    `Design and price your banner: ${DESIGN_URL}`,
    signature,
    '*Timing may vary based on artwork, order size, weekends, holidays, destination, and carrier conditions. First-order eligibility applies; promotions do not stack, and the best available discount applies.',
  ].filter(Boolean).join('\n\n');
  return {
    text: `${marketingText}${complianceText}`,
    html: renderOutboundEmailPreview({
      subject, bodyText, physicalAddress, unsubscribeUrl,
      mockupImageSrc, mockupAlt, businessName,
    }),
  };
}

module.exports = {
  SITE_URL,
  DESIGN_URL,
  LIVE_DELIVERY_URL,
  BRAND_LOGO_URL,
  HERO_IMAGE_URL,
  BRAND_ORANGE,
  BRAND_NAVY,
  FIRST_ORDER_PROMO_CODE,
  SIGNATURE,
  escapeHtml,
  polishOutboundSubject,
  splitBodyAndSignature,
  polishOutboundBodyText,
  paragraphs,
  deliveryPromiseStrip,
  complianceFooter,
  renderOutboundEmailPreview,
  renderOutboundDeliveryContent,
};
