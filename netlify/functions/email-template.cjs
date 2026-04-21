const BRAND_LOGO_URL = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';
const BRAND_ORANGE = '#ff6b35';
const BRAND_ORANGE_DARK = '#f45a24';
const BRAND_NAVY = '#18448D';
const {
  normalizeShippingAddress,
  hasShippingAddress,
  formatShippingCityStatePostal,
} = require('./shipping-address-helpers.cjs');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeName(fullName) {
  const normalizedFullName = String(fullName || '').trim().replace(/\s+/g, ' ');
  const firstName = normalizedFullName ? normalizedFullName.split(' ')[0] : '';
  return {
    fullName: normalizedFullName,
    firstName: firstName || 'there',
  };
}

function isCloudinaryUploadUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'res.cloudinary.com' && parsed.pathname.includes('/upload/');
  } catch {
    return false;
  }
}

function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getFinalizedThumbnailUrl(item, maxWidth = 240) {
  if (!item || !item.thumbnail_url) return null;
  const url = String(item.thumbnail_url);
  if (isCloudinaryUploadUrl(url)) {
    return url.replace('/upload/', `/upload/w_${maxWidth},c_limit,f_auto,q_auto/`);
  }
  if (isHttpUrl(url) && !isCloudinaryUploadUrl(url)) {
    return `https://res.cloudinary.com/dtrxl120u/image/fetch/w_${maxWidth},c_limit,f_auto,q_auto/${url}`;
  }
  return null;
}

function renderItems(items = []) {
  if (!items.length) return '';
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      ${items.map((item) => {
        const isYardSign = item.product_type === 'yard_sign' || item.productType === 'yard-sign';
        const thumbnail = item.thumbnailUrl || null;
        const quantity = Number(item.quantity || 0);
        const lineTotal = Number(item.lineTotal ?? item.price ?? 0);
        const unitPrice = Number(item.unitPrice ?? (quantity > 0 ? lineTotal / quantity : 0));
        const badgeLabel = item.productLabel || (isYardSign ? 'Yard Sign' : 'Banner');
        return `
          <tr>
            <td style="padding:14px;border-bottom:1px solid #e5e7eb;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  ${thumbnail ? `
                  <td style="width:92px;padding-right:12px;vertical-align:top;">
                    <img src="${escapeHtml(thumbnail)}" alt="${isYardSign ? 'Yard Sign Preview' : 'Banner Preview'}" width="88" style="display:block;border-radius:8px;border:1px solid #d1d5db;" />
                  </td>` : ''}
                  <td style="vertical-align:top;">
                    <p style="margin:0 0 4px;color:#0f172a;font-size:15px;font-weight:700;">${escapeHtml(item.name || item.displayName || 'Item')}</p>
                    <p style="margin:0 0 6px;"><span style="display:inline-block;background:#fff7ed;border:1px solid #fed7aa;border-radius:999px;color:#9a3412;font-size:11px;font-weight:700;padding:2px 8px;">${escapeHtml(badgeLabel)}</span></p>
                    ${item.sizeDisplay ? `<p style="margin:0 0 2px;color:#64748b;font-size:12px;">Size: ${escapeHtml(item.sizeDisplay)}</p>` : ''}
                    ${item.materialDisplay ? `<p style="margin:0 0 2px;color:#64748b;font-size:12px;">Material: ${escapeHtml(item.materialDisplay)}</p>` : ''}
                    ${item.printDisplay ? `<p style="margin:0 0 2px;color:#64748b;font-size:12px;">Print: ${escapeHtml(item.printDisplay)}</p>` : ''}
                    <p style="margin:0 0 4px;color:#475569;font-size:13px;">Qty: ${quantity}</p>
                    ${item.uploadedDesignsCount ? `<p style="margin:0 0 2px;color:#64748b;font-size:12px;">Uploaded Designs: ${Number(item.uploadedDesignsCount)}</p>` : ''}
                    ${item.stepStakesQty ? `<p style="margin:0 0 2px;color:#64748b;font-size:12px;">Step Stakes: ${Number(item.stepStakesQty)}</p>` : ''}
                    ${item.grommetsDisplay ? `<p style="margin:0 0 2px;color:#64748b;font-size:12px;">Grommets: ${escapeHtml(item.grommetsDisplay)}</p>` : ''}
                    ${item.polePocketsDisplay ? `<p style="margin:0 0 2px;color:#64748b;font-size:12px;">Pole Pockets: ${escapeHtml(item.polePocketsDisplay)}</p>` : ''}
                    ${item.ropeDisplay ? `<p style="margin:0 0 2px;color:#64748b;font-size:12px;">Rope: ${escapeHtml(item.ropeDisplay)}</p>` : ''}
                    ${lineTotal > 0 ? `<p style="margin:0 0 2px;color:${BRAND_NAVY};font-size:13px;font-weight:600;">Unit Price: $${unitPrice.toFixed(2)}</p>` : ''}
                    ${lineTotal > 0 ? `<p style="margin:0;color:${BRAND_ORANGE};font-size:14px;font-weight:700;">Line Total: $${lineTotal.toFixed(2)}</p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        `;
      }).join('')}
    </table>
  `;
}

function renderTotals({ subtotal = 0, tax = 0, total = 0, discountCents = 0, discountLabel = '' } = {}) {
  const discountDollars = Number(discountCents || 0) / 100;
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
      <tr><td style="padding:14px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr><td style="color:#64748b;font-size:13px;padding:4px 0;">Subtotal</td><td style="text-align:right;color:#0f172a;font-size:13px;padding:4px 0;">$${Number(subtotal).toFixed(2)}</td></tr>
          ${discountDollars > 0 ? `<tr><td style="color:${BRAND_ORANGE_DARK};font-size:13px;padding:4px 0;">${escapeHtml(discountLabel || 'Discount')}</td><td style="text-align:right;color:${BRAND_ORANGE_DARK};font-size:13px;padding:4px 0;">-$${discountDollars.toFixed(2)}</td></tr>` : ''}
          ${Number(tax) > 0 ? `<tr><td style="color:#64748b;font-size:13px;padding:4px 0;">Tax</td><td style="text-align:right;color:#0f172a;font-size:13px;padding:4px 0;">$${Number(tax).toFixed(2)}</td></tr>` : ''}
          <tr><td style="padding-top:8px;border-top:1px solid #cbd5e1;color:#0f172a;font-size:16px;font-weight:700;">Total</td><td style="text-align:right;padding-top:8px;border-top:1px solid #cbd5e1;color:${BRAND_NAVY};font-size:18px;font-weight:700;">$${Number(total).toFixed(2)}</td></tr>
        </table>
      </td></tr>
    </table>
  `;
}

function renderAddress(order) {
  const shippingAddress = normalizeShippingAddress({
    ...(order || {}),
    ...(order?.shippingAddress || {}),
    customer_name: order?.customer_name || order?.customerName || '',
  });
  const showCountry = shippingAddress.country && shippingAddress.country !== 'US';
  if (!hasShippingAddress(shippingAddress)) return '';
  const cityStateZipLine = formatShippingCityStatePostal(shippingAddress);
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
      <tr><td style="padding:14px;">
        <p style="margin:0 0 8px;color:#0f172a;font-size:14px;font-weight:700;">Shipping Address</p>
        ${shippingAddress.name ? `<p style="margin:0;color:#1f2937;font-size:13px;font-weight:600;">${escapeHtml(shippingAddress.name)}</p>` : ''}
        ${shippingAddress.line1 ? `<p style="margin:2px 0 0;color:#334155;font-size:13px;">${escapeHtml(shippingAddress.line1)}</p>` : ''}
        ${shippingAddress.line2 ? `<p style="margin:2px 0 0;color:#334155;font-size:13px;">${escapeHtml(shippingAddress.line2)}</p>` : ''}
        ${cityStateZipLine ? `<p style="margin:2px 0 0;color:#334155;font-size:13px;">${escapeHtml(cityStateZipLine)}</p>` : ''}
        ${showCountry ? `<p style="margin:2px 0 0;color:#334155;font-size:13px;">${escapeHtml(shippingAddress.country)}</p>` : ''}
      </td></tr>
    </table>
  `;
}

function renderEmailLayout({
  title,
  subtitle,
  eyebrow = 'Banners On The Fly',
  orderNumber,
  bodyHtml,
}) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(title)}</title>
    </head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding:20px 0;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="620" style="max-width:620px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.12);">
              <tr>
                <td style="padding:20px 24px 10px;text-align:center;background:#ffffff;">
                  <img src="${BRAND_LOGO_URL}" alt="Banners On The Fly" width="200" style="display:block;margin:0 auto;height:auto;max-width:100%;" />
                </td>
              </tr>
              <tr>
                <td bgcolor="${BRAND_ORANGE}" style="background:${BRAND_ORANGE};background:linear-gradient(135deg,${BRAND_ORANGE} 0%,${BRAND_NAVY} 100%);padding:22px 24px;color:#ffffff;text-align:center;">
                  <p style="margin:0 0 6px;color:#fff7ed;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;font-weight:700;">${escapeHtml(eyebrow)}</p>
                  <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3;">${escapeHtml(title)}</h1>
                  ${subtitle ? `<p style="margin:8px 0 0;color:#fff7ed;font-size:14px;">${escapeHtml(subtitle)}</p>` : ''}
                  ${orderNumber ? `<p style="margin:10px 0 0;color:#ffffff;font-size:13px;font-family:monospace;">Order #${escapeHtml(orderNumber)}</p>` : ''}
                </td>
              </tr>
              <tr>
                <td style="padding:22px 24px;">${bodyHtml || ''}</td>
              </tr>
              <tr>
                <td style="padding:18px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
                  <p style="margin:0;color:#64748b;font-size:12px;">Questions? Reply to this email or contact support@bannersonthefly.com</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

module.exports = {
  normalizeName,
  getFinalizedThumbnailUrl,
  renderItems,
  renderTotals,
  renderAddress,
  renderEmailLayout,
  escapeHtml,
};
