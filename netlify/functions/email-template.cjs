const BRAND_LOGO_URL = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';

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
        const isYardSign = item.product_type === 'yard_sign';
        const thumbnail = item.thumbnailUrl || null;
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
                    <p style="margin:0 0 4px;color:#0f172a;font-size:15px;font-weight:700;">${escapeHtml(item.name || 'Item')}</p>
                    <p style="margin:0 0 4px;color:#475569;font-size:13px;">Qty: ${Number(item.quantity || 0)}</p>
                    ${item.options ? `<p style="margin:0 0 4px;color:#64748b;font-size:12px;">${escapeHtml(item.options)}</p>` : ''}
                    ${item.price != null ? `<p style="margin:0;color:#0f766e;font-size:14px;font-weight:700;">$${Number(item.price || 0).toFixed(2)}</p>` : ''}
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
          ${discountDollars > 0 ? `<tr><td style="color:#059669;font-size:13px;padding:4px 0;">${escapeHtml(discountLabel || 'Discount')}</td><td style="text-align:right;color:#059669;font-size:13px;padding:4px 0;">-$${discountDollars.toFixed(2)}</td></tr>` : ''}
          ${Number(tax) > 0 ? `<tr><td style="color:#64748b;font-size:13px;padding:4px 0;">Tax</td><td style="text-align:right;color:#0f172a;font-size:13px;padding:4px 0;">$${Number(tax).toFixed(2)}</td></tr>` : ''}
          <tr><td style="padding-top:8px;border-top:1px solid #cbd5e1;color:#0f172a;font-size:16px;font-weight:700;">Total</td><td style="text-align:right;padding-top:8px;border-top:1px solid #cbd5e1;color:#0f766e;font-size:18px;font-weight:700;">$${Number(total).toFixed(2)}</td></tr>
        </table>
      </td></tr>
    </table>
  `;
}

function renderAddress(order) {
  const hasAddress = order.shipping_name || order.shipping_street || order.shipping_street2 || order.shipping_city || order.shipping_state || order.shipping_zip || order.shipping_country;
  if (!hasAddress) return '';
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
      <tr><td style="padding:14px;">
        <p style="margin:0 0 8px;color:#0f172a;font-size:14px;font-weight:700;">Shipping Address</p>
        ${order.shipping_name ? `<p style="margin:0;color:#1f2937;font-size:13px;font-weight:600;">${escapeHtml(order.shipping_name)}</p>` : ''}
        ${order.shipping_street ? `<p style="margin:2px 0 0;color:#334155;font-size:13px;">${escapeHtml(order.shipping_street)}</p>` : ''}
        ${order.shipping_street2 ? `<p style="margin:2px 0 0;color:#334155;font-size:13px;">${escapeHtml(order.shipping_street2)}</p>` : ''}
        ${(order.shipping_city || order.shipping_state || order.shipping_zip) ? `<p style="margin:2px 0 0;color:#334155;font-size:13px;">${escapeHtml(order.shipping_city || '')}${order.shipping_city && order.shipping_state ? ', ' : ''}${escapeHtml(order.shipping_state || '')} ${escapeHtml(order.shipping_zip || '')}</p>` : ''}
        ${order.shipping_country && order.shipping_country !== 'US' ? `<p style="margin:2px 0 0;color:#334155;font-size:13px;">${escapeHtml(order.shipping_country)}</p>` : ''}
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
                <td bgcolor="#059669" style="background:#059669;background:linear-gradient(135deg,#059669 0%,#10b981 100%);padding:22px 24px;color:#ffffff;text-align:center;">
                  <p style="margin:0 0 6px;color:#ecfdf5;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;font-weight:700;">${escapeHtml(eyebrow)}</p>
                  <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3;">${escapeHtml(title)}</h1>
                  ${subtitle ? `<p style="margin:8px 0 0;color:#ecfdf5;font-size:14px;">${escapeHtml(subtitle)}</p>` : ''}
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
