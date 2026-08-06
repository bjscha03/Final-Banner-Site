'use strict';

const BRAND_LOGO_URL = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';
const BRAND_ORANGE = '#ff6b35';
const BRAND_NAVY = '#18448D';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paragraphs(bodyText) {
  return String(bodyText || '').split(/\n{2,}/).map((paragraph) => {
    const lines = paragraph.split(/\n/).map(escapeHtml).join('<br>');
    return `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.65;">${lines}</p>`;
  }).join('');
}

function complianceFooter({ physicalAddress, unsubscribeUrl } = {}) {
  if (!physicalAddress || !unsubscribeUrl) return '';
  return `<p style="margin:8px 0 0;color:#64748b;font-size:11px;line-height:1.5;">${escapeHtml(physicalAddress)}<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:${BRAND_NAVY};">Unsubscribe from future sales emails</a></p>`;
}

function renderOutboundEmailPreview({ subject, bodyText, physicalAddress, unsubscribeUrl }) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding:20px 0;background:#f1f5f9;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="620" style="width:100%;max-width:620px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.12);">
        <tr><td style="padding:20px 24px 12px;text-align:center;background:#ffffff;">
          <img src="${BRAND_LOGO_URL}" alt="Banners On The Fly" width="200" style="display:block;margin:0 auto;max-width:100%;height:auto;">
        </td></tr>
        <tr><td bgcolor="${BRAND_ORANGE}" style="padding:14px 24px;background:${BRAND_ORANGE};background:linear-gradient(135deg,${BRAND_ORANGE} 0%,${BRAND_NAVY} 100%);color:#ffffff;text-align:center;">
          <p style="margin:0;color:#ffffff;font-size:12px;letter-spacing:.7px;text-transform:uppercase;font-weight:700;">Banners On The Fly</p>
        </td></tr>
        <tr><td style="padding:24px;">${paragraphs(bodyText)}</td></tr>
        <tr><td style="padding:18px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="margin:0;color:#64748b;font-size:12px;line-height:1.5;">Banners On The Fly · Professional banners, signs, and printed displays</p>
          ${complianceFooter({ physicalAddress, unsubscribeUrl })}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderOutboundDeliveryContent({ subject, bodyText, physicalAddress, unsubscribeUrl }) {
  const complianceText = `\n\n—\nBanners On The Fly\n${String(physicalAddress).trim()}\nUnsubscribe: ${String(unsubscribeUrl).trim()}`;
  return {
    text: `${String(bodyText || '').trim()}${complianceText}`,
    html: renderOutboundEmailPreview({ subject, bodyText, physicalAddress, unsubscribeUrl }),
  };
}

module.exports = {
  BRAND_LOGO_URL,
  BRAND_ORANGE,
  BRAND_NAVY,
  escapeHtml,
  paragraphs,
  complianceFooter,
  renderOutboundEmailPreview,
  renderOutboundDeliveryContent,
};
