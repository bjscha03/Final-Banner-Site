const SITE_URL = 'https://bannersonthefly.com';
const BRAND_LOGO_URL = `${SITE_URL}/images/header-logo.png`;

export function escapeTradeShowEmailHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
export function getTradeShowPlanningUrl() {
  return `${SITE_URL}/design`;
}

function formatDateRange(event) {
  const start = new Date(`${event.startDate}T12:00:00Z`);
  const end = new Date(`${event.endDate}T12:00:00Z`);
  const monthDay = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const endLabel = sameMonth ? String(end.getUTCDate()) : monthDay.format(end);
  return `${monthDay.format(start)}–${endLabel}, ${end.getUTCFullYear()}`;
}

export function buildTradeShowEmail({ event, exhibitorName, discountCode, unsubscribeUrl }) {
  const cleanName = String(exhibitorName ?? '').trim();
  const cleanCode = String(discountCode ?? '').trim().toUpperCase();
  const eventDates = formatDateRange(event);
  const planningUrl = getTradeShowPlanningUrl();
  const resolvedUnsubscribeUrl = String(unsubscribeUrl || `${SITE_URL}/.netlify/functions/trade-show-unsubscribe?token=preview`);
  const subject = `${cleanName} — Save 20% on banners for ${event.name}`;
  const safeName = escapeTradeShowEmailHtml(cleanName);
  const safeEventName = escapeTradeShowEmailHtml(event.name);
  const safeDates = escapeTradeShowEmailHtml(eventDates);
  const safeLocation = escapeTradeShowEmailHtml(`${event.city}, ${event.state}`);
  const safeCode = escapeTradeShowEmailHtml(cleanCode);
  const safePlanningUrl = escapeTradeShowEmailHtml(planningUrl);
  const safeUnsubscribeUrl = escapeTradeShowEmailHtml(resolvedUnsubscribeUrl);

  const text = [
    `Hi ${cleanName},`,
    '',
    `Getting ready for ${event.name}, ${eventDates} in ${event.city}, ${event.state}?`,
    '',
    'Banners On The Fly produces premium custom vinyl banners and mesh banners for trade shows and events, with:',
    '',
    '• 24-hour production',
    '• Free Next-Day Air delivery',
    '• Premium full-color vinyl and mesh banners',
    '• Fast online ordering for event deadlines',
    '',
    `Use code ${cleanCode} for 20% off your banner order.`,
    '',
    `Start designing your banner: ${planningUrl}`,
    '',
    `Banners On The Fly is not affiliated with or endorsed by ${event.name} or its organizer.`,
    '',
    `Unsubscribe from trade-show promotional emails: ${resolvedUnsubscribeUrl}`,
    '',
    'Banners On The Fly',
    SITE_URL,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeTradeShowEmailHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#eef3f8;color:#172033;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef3f8;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(15,45,92,.12);">
            <tr>
              <td style="background:#f7faff;padding:24px 30px 20px;text-align:center;border-bottom:4px solid #ff6a00;">
                <img src="${BRAND_LOGO_URL}" width="210" alt="Banners On The Fly" style="display:block;max-width:100%;height:auto;margin:0 auto;border:0;">
              </td>
            </tr>
            <tr>
              <td style="padding:32px 30px 8px;">
                <p style="margin:0 0 16px;font-size:17px;line-height:1.55;color:#172033;">Hi ${safeName},</p>
                <h1 style="margin:0 0 14px;font-size:27px;line-height:1.2;color:#0f2d5c;">Get your banners ready for ${safeEventName}</h1>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#46566d;">The show is scheduled for <strong>${safeDates}</strong> in <strong>${safeLocation}</strong>. When the deadline is close, we make ordering premium custom vinyl and mesh banners fast and straightforward.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;background:#fff8f2;border:1px solid #ffd6b8;border-radius:14px;">
                  <tr><td style="padding:20px 22px 10px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9a3e00;">Built for tight trade-show deadlines</td></tr>
                  <tr><td style="padding:0 22px 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td width="28" valign="top" style="padding:6px 0;color:#ff6a00;font-size:18px;font-weight:900;">✓</td>
                        <td style="padding:6px 0;font-size:15px;line-height:1.45;color:#25344b;"><strong>Premium custom vinyl and mesh banners</strong></td>
                      </tr>
                      <tr>
                        <td width="28" valign="top" style="padding:6px 0;color:#ff6a00;font-size:18px;font-weight:900;">✓</td>
                        <td style="padding:6px 0;font-size:17px;line-height:1.45;"><strong style="color:#e45700;font-weight:900;">24-hour production</strong></td>
                      </tr>
                      <tr>
                        <td width="28" valign="top" style="padding:6px 0;color:#ff6a00;font-size:18px;font-weight:900;">✓</td>
                        <td style="padding:6px 0;font-size:17px;line-height:1.45;"><strong style="color:#e45700;font-weight:900;">Free Next-Day Air delivery</strong></td>
                      </tr>
                      <tr>
                        <td width="28" valign="top" style="padding:6px 0;color:#ff6a00;font-size:18px;font-weight:900;">✓</td>
                        <td style="padding:6px 0;font-size:15px;line-height:1.45;color:#25344b;"><strong>Fast online ordering for trade-show deadlines</strong></td>
                      </tr>
                    </table>
                  </td></tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;background:#fff4eb;border:2px dashed #ff6a00;border-radius:12px;">
                  <tr><td style="padding:18px;text-align:center;">
                    <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9a3e00;">Save 20% on your banner order</div>
                    <div style="margin-top:6px;font-size:28px;font-weight:800;letter-spacing:.06em;color:#c94e00;">${safeCode}</div>
                  </td></tr>
                </table>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 28px;">
                  <tr><td bgcolor="#ff6a00" style="border-radius:10px;">
                    <a href="${safePlanningUrl}" style="display:inline-block;padding:15px 24px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;">Start Designing Your Banner</a>
                  </td></tr>
                </table>
                <p style="margin:0 0 24px;text-align:center;font-size:13px;line-height:1.5;color:#6b778a;">Upload your artwork, choose your banner options, and apply the code to carry the discount into checkout.</p>
              </td>
            </tr>
            <tr><td style="padding:22px 30px;background:#f7f9fc;text-align:center;font-size:11px;line-height:1.65;color:#718096;">
              <strong style="font-size:12px;color:#46566d;">Banners On The Fly · Premium custom vinyl and mesh banners</strong><br>
              <a href="${SITE_URL}" style="color:#18448d;">bannersonthefly.com</a>
              <div style="margin-top:12px;">Banners On The Fly is not affiliated with or endorsed by ${safeEventName} or its organizer.</div>
              <div style="margin-top:8px;"><a href="${safeUnsubscribeUrl}" style="color:#52657d;text-decoration:underline;">Unsubscribe from trade-show promotional emails</a></div>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text, eventDates, planningUrl };
}
