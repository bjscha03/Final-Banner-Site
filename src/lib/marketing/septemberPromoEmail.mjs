const SITE_URL = 'https://bannersonthefly.com';
const LOGO_URL = `${SITE_URL}/images/header-logo.png`;
const SPORTS_BANNER_URL = `${SITE_URL}/images/email/september-football-banner.jpg`;
const GRAND_OPENING_BANNER_URL = `${SITE_URL}/images/email/september-grand-opening-banner.jpg`;
const DEFAULT_PHYSICAL_ADDRESS = 'PO Box 369, Crestwood, KY 40014';

export const SEPTEMBER_PROMO_SUBJECT = '25% Off Large Banners — This Week Only';
export const SEPTEMBER_PROMO_PREHEADER = "Save 25% on any 6' × 3' or larger banner through September 8.";
export const SEPTEMBER_PROMO_SHOP_URL = `${SITE_URL}/google-ads-banner?utm_source=email&utm_medium=customer_promo&utm_campaign=september_big25#order-builder`;
export const SEPTEMBER_PROMO_DESIGN_URL = `${SITE_URL}/design?product=banner&utm_source=email&utm_medium=customer_promo&utm_campaign=september_big25#order-builder`;

export function escapeSeptemberPromoHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function offerRow(label, value, valueStyle = '') {
  return `<tr>
    <td width="28" valign="top" style="padding:5px 0;color:#ff5a1f;font-size:18px;font-weight:900;line-height:1.25;">&#10003;</td>
    <td valign="top" style="padding:5px 0;font-size:15px;line-height:1.45;color:#14264b;"><strong>${label}:</strong> <span style="${valueStyle}">${value}</span></td>
  </tr>`;
}

function needCell(symbol, label) {
  return `<td class="need-col" width="33.333%" valign="top" style="padding:6px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #dfe6ef;border-radius:12px;background:#ffffff;">
      <tr>
        <td width="52" valign="middle" style="padding:16px 4px 16px 14px;text-align:center;color:#ff5a1f;font-size:27px;font-weight:900;line-height:1;">${symbol}</td>
        <td valign="middle" style="padding:14px 12px 14px 4px;color:#14264b;font-size:14px;line-height:1.35;font-weight:700;">${label}</td>
      </tr>
    </table>
  </td>`;
}

function outlookButton(url, label, { background, color, border }) {
  const safeUrl = escapeSeptemberPromoHtml(url);
  const safeLabel = escapeSeptemberPromoHtml(label);
  return `<!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:52px;v-text-anchor:middle;width:330px;" arcsize="16%" strokecolor="${border}" fillcolor="${background}">
    <w:anchorlock/>
    <center style="color:${color};font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;">${safeLabel}</center>
  </v:roundrect>
  <![endif]--><!--[if !mso]><!--><a href="${safeUrl}" class="cta-button" style="display:inline-block;width:330px;max-width:100%;box-sizing:border-box;border:${border === background ? '1px' : '2px'} solid ${border};border-radius:9px;background:${background};color:${color};font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:800;line-height:50px;text-align:center;text-decoration:none;-webkit-text-size-adjust:none;">${safeLabel}</a><!--<![endif]-->`;
}

export function buildSeptemberPromoEmail({ unsubscribeUrl, physicalAddress = DEFAULT_PHYSICAL_ADDRESS }) {
  const resolvedUnsubscribeUrl = String(unsubscribeUrl || `${SITE_URL}/.netlify/functions/marketing-email-unsubscribe?token=preview`);
  const safeUnsubscribeUrl = escapeSeptemberPromoHtml(resolvedUnsubscribeUrl);
  const safePhysicalAddress = escapeSeptemberPromoHtml(String(physicalAddress || DEFAULT_PHYSICAL_ADDRESS).trim());
  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
    <title>${escapeSeptemberPromoHtml(SEPTEMBER_PROMO_SUBJECT)}</title>
    <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
    <style>
      table,td{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt}
      img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
      a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
      @media only screen and (max-width:620px){
        .email-shell{width:100%!important;border-radius:0!important}
        .mobile-pad{padding-left:18px!important;padding-right:18px!important}
        .hero{padding:27px 18px 29px!important}
        .hero h1{font-size:35px!important;line-height:1.08!important}
        .hero p{font-size:18px!important;line-height:1.45!important}
        .card-pad{padding:20px 18px!important}
        .need-col{display:block!important;width:100%!important;padding:5px 0!important}
        .cta-button{width:100%!important}
        .desktop-spacer{height:5px!important;line-height:5px!important}
      }
    </style>
  </head>
  <body style="margin:0!important;padding:0!important;background:#eef2f6;color:#14264b;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeSeptemberPromoHtml(SEPTEMBER_PROMO_PREHEADER)}&#847;&zwnj;&#8199;&#65279;&#847;&zwnj;&#8199;&#65279;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eef2f6" style="width:100%;background:#eef2f6;">
      <tr>
        <td align="center" style="padding:18px 10px 26px;">
          <table role="presentation" class="email-shell" width="660" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:660px;max-width:660px;background:#ffffff;border-radius:17px;overflow:hidden;box-shadow:0 7px 28px rgba(18,42,78,.10);">
            <tr>
              <td align="center" style="padding:22px 24px 20px;background:#ffffff;">
                <a href="${SITE_URL}" style="text-decoration:none;"><img src="${LOGO_URL}" width="250" alt="Banners On The Fly" style="display:block;width:250px;max-width:100%;height:auto;margin:0 auto;"></a>
              </td>
            </tr>
            <tr>
              <td class="hero" align="center" bgcolor="#ff5a1f" style="padding:28px 28px 31px;background:#ff5a1f;color:#ffffff;">
                <p style="margin:0 0 10px;color:#ffffff;font-size:16px;line-height:1.3;font-weight:800;letter-spacing:.04em;text-transform:uppercase;">Banners On The Fly</p>
                <h1 style="margin:0;color:#ffffff;font-size:42px;line-height:1.1;font-weight:900;letter-spacing:.01em;">25% OFF <span style="font-size:.82em;">Large Banners</span></h1>
                <p style="margin:11px 0 0;color:#ffffff;font-size:20px;line-height:1.45;">Save on any banner 6' &times; 3' or larger.<br>Use code <strong>BIG25</strong> &mdash; valid for one week only.</p>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="padding:20px 30px 5px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #d7e0ea;border-radius:12px;background:#fbfcfe;">
                  <tr>
                    <td class="card-pad" style="padding:20px 22px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td width="78" valign="middle" align="center" style="width:78px;">
                            <table role="presentation" width="64" cellspacing="0" cellpadding="0" border="0" style="width:64px;background:#ffffff;border-radius:50%;">
                              <tr><td height="64" align="center" valign="middle" style="height:64px;color:#ff5a1f;font-size:14px;line-height:1;font-weight:900;letter-spacing:.08em;">SEP</td></tr>
                            </table>
                          </td>
                          <td valign="middle" style="padding-left:12px;color:#14264b;font-size:16px;line-height:1.6;">September is the time to order ahead of the busy fall season. Save now on banners for your business, school, event, or next big promotion.</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="padding:11px 30px 5px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #d7e0ea;border-radius:12px;background:#fbfcfe;">
                  <tr>
                    <td class="card-pad" style="padding:18px 24px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        ${offerRow('Offer', '25% OFF qualifying banners')}
                        ${offerRow('Eligible Sizes', "6' &times; 3' and larger")}
                        ${offerRow('Promo Code', 'BIG25', 'color:#ff5a1f;font-weight:900;')}
                        ${offerRow('Expires', 'September 8, 2026')}
                        ${offerRow('Timing', 'One week only')}
                        ${offerRow('Important', 'Cannot be combined with other offers')}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="padding:11px 30px 5px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #d7e0ea;border-radius:12px;background:#fbfcfe;">
                  <tr><td align="center" style="padding:16px 16px 11px;color:#17386f;font-size:20px;line-height:1.3;font-weight:900;">High-Quality Banners. Big Impact.</td></tr>
                  <tr><td style="padding:0 16px 9px;"><img src="${SPORTS_BANNER_URL}" width="566" alt="Printed school sports banner displayed inside a gym" style="display:block;width:100%;max-width:566px;height:auto;border-radius:7px;"></td></tr>
                  <tr><td style="padding:0 16px 16px;"><img src="${GRAND_OPENING_BANNER_URL}" width="566" alt="Printed grand opening banner displayed on a local business" style="display:block;width:100%;max-width:566px;height:auto;border-radius:7px;"></td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="padding:11px 30px 5px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #d7e0ea;border-radius:12px;background:#fbfcfe;">
                  <tr><td align="center" style="padding:16px 16px 7px;color:#17386f;font-size:20px;line-height:1.3;font-weight:900;">Perfect for upcoming fall needs</td></tr>
                  <tr>
                    <td style="padding:0 11px 6px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
                        ${needCell('&#9733;', 'Labor Day promotions')}
                        ${needCell('&#9679;', 'Fall sports and school events')}
                        ${needCell('&#9670;', 'Trade shows and vendor booths')}
                      </tr></table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 11px 13px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
                        ${needCell('&#9635;', 'Grand openings and retail sales')}
                        ${needCell('&#10010;', 'Church and community events')}
                        ${needCell('&#10022;', 'Fall festivals, fairs, and Halloween promotions')}
                      </tr></table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" align="center" style="padding:18px 30px 0;">
                ${outlookButton(SEPTEMBER_PROMO_SHOP_URL, 'Shop Large Banners', { background: '#ff5a1f', color: '#ffffff', border: '#ff5a1f' })}
              </td>
            </tr>
            <tr><td class="desktop-spacer" height="12" style="height:12px;line-height:12px;font-size:1px;">&nbsp;</td></tr>
            <tr>
              <td class="mobile-pad" align="center" style="padding:0 30px 24px;">
                ${outlookButton(SEPTEMBER_PROMO_DESIGN_URL, 'Start Your Design', { background: '#ffffff', color: '#ff5a1f', border: '#ff5a1f' })}
              </td>
            </tr>
            <tr>
              <td align="center" bgcolor="#f7f9fc" style="padding:20px 24px;background:#f7f9fc;border-top:1px solid #dbe3ed;color:#68758b;font-size:12px;line-height:1.65;">
                Questions? Reply to this email or contact <a href="mailto:support@bannersonthefly.com" style="color:#1769d2;text-decoration:none;">support@bannersonthefly.com</a><br>
                <span style="color:#7a8799;">You received this offer because you previously ordered from Banners On The Fly.</span><br>
                <span style="color:#7a8799;">Banners On The Fly &middot; ${safePhysicalAddress}</span><br>
                <a href="${safeUnsubscribeUrl}" style="color:#68758b;text-decoration:underline;">Unsubscribe from promotional emails</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    SEPTEMBER_PROMO_SUBJECT,
    '',
    "25% OFF ANY BANNER 6' × 3' OR LARGER",
    'Use code BIG25 through September 8, 2026.',
    '',
    'September is the time to order ahead of the busy fall season. Save now on banners for your business, school, event, or next big promotion.',
    '',
    'Offer: 25% off qualifying banners',
    "Eligible sizes: 6' × 3' and larger (including 3' × 6')",
    'Promo code: BIG25',
    'Expires: September 8, 2026',
    'One week only. Cannot be combined with other offers.',
    '',
    'Perfect for Labor Day promotions, fall sports and school events, trade shows, vendor booths, grand openings, retail sales, church and community events, fall festivals, fairs, and Halloween promotions.',
    '',
    `Shop Large Banners: ${SEPTEMBER_PROMO_SHOP_URL}`,
    `Start Your Design: ${SEPTEMBER_PROMO_DESIGN_URL}`,
    '',
    'Questions? Reply to this email or contact support@bannersonthefly.com.',
    `Banners On The Fly · ${String(physicalAddress || DEFAULT_PHYSICAL_ADDRESS).trim()}`,
    `Unsubscribe from promotional emails: ${resolvedUnsubscribeUrl}`,
  ].join('\n');

  return {
    subject: SEPTEMBER_PROMO_SUBJECT,
    preheader: SEPTEMBER_PROMO_PREHEADER,
    html,
    text,
    shopUrl: SEPTEMBER_PROMO_SHOP_URL,
    designUrl: SEPTEMBER_PROMO_DESIGN_URL,
  };
}

export const _test = {
  DEFAULT_PHYSICAL_ADDRESS,
  GRAND_OPENING_BANNER_URL,
  LOGO_URL,
  SITE_URL,
  SPORTS_BANNER_URL,
};
