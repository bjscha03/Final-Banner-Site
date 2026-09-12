export const AI_DESIGNER_TEST_SUBJECT = 'Try our new AI Banner Designer — 30% off your next banner';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const firstName = (value) => {
  const cleaned = String(value || '').trim();
  if (!cleaned || cleaned.includes('@')) return 'there';
  return cleaned.split(/\s+/)[0];
};

export const AI_DESIGNER_PROMO_CONTENT_ID = 'bof-ai-designer-promo';

// IMPORTANT: this source file is 200x200. Keep it rendered at 200px max so it is
// never stretched and blurred in email clients. The surrounding hero is real HTML
// text/colors so the important message remains crisp at every screen density.
const AI_DESIGNER_PROMO_IMAGE_URL = 'https://res.cloudinary.com/dtrxl120u/image/upload/v1789237977/banners-on-the-fly/email/ai-designer-promo-canva.jpg';

export function buildAiDesignerTestEmail({
  customerName,
  discountCode,
  unsubscribeUrl,
  physicalAddress,
  siteUrl = 'https://www.bannersonthefly.com',
}) {
  const name = firstName(customerName);
  const safeName = escapeHtml(name);
  const safeCode = escapeHtml(discountCode);
  const safeAddress = escapeHtml(physicalAddress);
  const safeUnsubscribe = escapeHtml(unsubscribeUrl);
  const normalizedSiteUrl = String(siteUrl || 'https://www.bannersonthefly.com').replace(/\/$/, '');
  const designerUrl = `${normalizedSiteUrl}/design?product=banner`;

  const html = `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @media only screen and (max-width:620px) {
        .hero-copy, .hero-art { display:block !important; width:100% !important; max-width:100% !important; }
        .hero-art { padding-top:22px !important; text-align:center !important; }
        .hero-art img { margin:0 auto !important; }
        .email-pad { padding-left:22px !important; padding-right:22px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#0f2138;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fa;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 28px rgba(15,33,56,.12);">
            <tr>
              <td style="background:#0f2138;padding:24px 28px;border-top:5px solid #f36b00;">
                <div style="font-size:25px;font-weight:800;letter-spacing:.3px;color:#ffffff;">BANNERS <span style="color:#f36b00;">ON THE FLY</span></div>
                <div style="margin-top:6px;font-size:13px;color:#cbd5e1;">Fast custom banners. Now with AI-powered design.</div>
              </td>
            </tr>

            <tr>
              <td style="background:#10263f;padding:30px 28px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td class="hero-copy" width="410" valign="top" style="padding-right:22px;">
                      <div style="font-size:12px;line-height:1.2;font-weight:800;letter-spacing:1.8px;color:#ff7a00;text-transform:uppercase;">NEW • AI-POWERED</div>
                      <div style="margin-top:7px;font-size:36px;line-height:1.02;font-weight:900;color:#ffffff;letter-spacing:-.6px;">AI BANNER<br /><span style="color:#ff7a00;">DESIGNER</span></div>
                      <div style="margin-top:12px;font-size:17px;line-height:1.45;font-weight:700;color:#e8eef5;">From an idea to a professional banner design in minutes.</div>
                      <div style="margin-top:10px;font-size:14px;line-height:1.55;color:#bdc9d7;">Describe what you want. Add a logo or artwork if you have it. Customize the result, then send it to print.</div>

                      <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:18px;">
                        <tr>
                          <td style="padding:7px 10px;border:1px solid #35506d;border-radius:7px;color:#ffffff;font-size:11px;font-weight:800;white-space:nowrap;">1&nbsp; DESCRIBE</td>
                          <td style="padding:0 7px;color:#ff7a00;font-size:16px;font-weight:900;">›</td>
                          <td style="padding:7px 10px;border:1px solid #35506d;border-radius:7px;color:#ffffff;font-size:11px;font-weight:800;white-space:nowrap;">2&nbsp; GENERATE</td>
                          <td style="padding:0 7px;color:#ff7a00;font-size:16px;font-weight:900;">›</td>
                          <td style="padding:7px 10px;border:1px solid #35506d;border-radius:7px;color:#ffffff;font-size:11px;font-weight:800;white-space:nowrap;">3&nbsp; PRINT</td>
                        </tr>
                      </table>

                      <div style="margin-top:18px;font-size:15px;font-weight:800;font-style:italic;color:#ffffff;">From Prompt to Print.</div>
                    </td>
                    <td class="hero-art" width="200" valign="middle" align="right">
                      <a href="${designerUrl}" style="display:inline-block;text-decoration:none;border:0;">
                        <img src="${AI_DESIGNER_PROMO_IMAGE_URL}" alt="AI Banner Designer example showing a construction banner on screen and at a job site" width="200" height="200" style="display:block;width:200px;height:200px;max-width:200px;border:0;outline:none;text-decoration:none;border-radius:10px;" />
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:30px 30px 10px;">
                <p style="margin:0 0 16px;font-size:17px;line-height:1.6;">Hi ${safeName},</p>
                <h1 style="margin:0 0 14px;font-size:29px;line-height:1.15;color:#0f2138;">We want past customers to be the first to try it.</h1>
                <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#334155;">Our new <strong>AI Banner Designer</strong> can turn a simple idea into a professional banner design in minutes. It works for <strong>business promotions, job sites, schools, sports, events, parties, and personal projects</strong>.</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;background:#fff4e8;border:1px solid #ffd2ad;border-radius:14px;">
                  <tr>
                    <td style="padding:22px;text-align:center;">
                      <div style="font-size:13px;font-weight:800;letter-spacing:1.1px;color:#b64b00;text-transform:uppercase;">Past customer test offer</div>
                      <div style="margin-top:7px;font-size:34px;font-weight:900;color:#0f2138;">30% OFF</div>
                      <div style="margin-top:8px;font-size:14px;color:#475569;">Use your one-time code:</div>
                      <div style="display:inline-block;margin-top:10px;padding:12px 20px;border-radius:9px;background:#0f2138;color:#ffffff;font-size:22px;font-weight:900;letter-spacing:1.5px;">${safeCode}</div>
                    </td>
                  </tr>
                </table>

                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 24px;">
                  <tr>
                    <td bgcolor="#f36b00" style="border-radius:9px;">
                      <a href="${designerUrl}" style="display:inline-block;padding:15px 28px;color:#ffffff;text-decoration:none;font-size:17px;font-weight:800;">TRY THE AI BANNER DESIGNER →</a>
                    </td>
                  </tr>
                </table>

                <div style="margin:0 0 24px;padding:18px;border-radius:12px;background:#eef4fb;border-left:4px solid #18448d;">
                  <div style="font-size:16px;font-weight:800;color:#0f2138;">We want your feedback.</div>
                  <p style="margin:7px 0 0;font-size:14px;line-height:1.55;color:#475569;">After you try the AI designer, reply and tell us what you liked, what was confusing, or what we should improve. Once you send your feedback, we’ll send you an <strong>additional 20% off code for a future order.</strong></p>
                </div>

                <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#64748b;">Your 30% code is intended for you as a past Banners On The Fly customer and can be used once.</p>
                <p style="margin:0;font-size:14px;line-height:1.55;color:#64748b;">Thanks for helping us make the designer better.</p>
                <p style="margin:18px 0 0;font-size:15px;font-weight:700;color:#0f2138;">— Banners On The Fly</p>
              </td>
            </tr>
            <tr>
              <td class="email-pad" style="padding:22px 30px 28px;">
                <div style="border-top:1px solid #e2e8f0;padding-top:18px;text-align:center;font-size:11px;line-height:1.5;color:#94a3b8;">
                  ${safeAddress}<br />
                  <a href="${safeUnsubscribe}" style="color:#64748b;">Unsubscribe from promotional emails</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Hi ${name},\n\nWe just launched our new AI Banner Designer. Describe the banner you want, add your logo or artwork if you have it, and the designer can create a professional concept in minutes. It works for business promotions, job sites, schools, sports, events, parties, and personal projects.\n\nAs a past customer, use this one-time code for 30% off your next banner:\n${discountCode}\n\nTry the AI Banner Designer: ${designerUrl}\n\nAfter you try it, reply with your feedback. Once you send your feedback, we’ll send you an additional 20% off code for a future order.\n\nThanks for helping us make the designer better.\n— Banners On The Fly\n\n${physicalAddress}\nUnsubscribe: ${unsubscribeUrl}`;

  return { subject: AI_DESIGNER_TEST_SUBJECT, html, text };
}
