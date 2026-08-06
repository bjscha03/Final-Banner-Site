const SITE_URL = 'https://bannersonthefly.com';

export function escapeTradeShowEmailHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
export function getTradeShowPlanningUrl(event) {
  return `${SITE_URL}/trade-shows/${encodeURIComponent(event.slug)}`;
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

export function buildTradeShowEmail({ event, exhibitorName, discountCode }) {
  const cleanName = String(exhibitorName ?? '').trim();
  const cleanCode = String(discountCode ?? '').trim().toUpperCase();
  const eventDates = formatDateRange(event);
  const planningUrl = getTradeShowPlanningUrl(event);
  const subject = `${cleanName} — Save 20% on banners for ${event.name}`;
  const safeName = escapeTradeShowEmailHtml(cleanName);
  const safeEventName = escapeTradeShowEmailHtml(event.name);
  const safeDates = escapeTradeShowEmailHtml(eventDates);
  const safeLocation = escapeTradeShowEmailHtml(`${event.city}, ${event.state}`);
  const safeCode = escapeTradeShowEmailHtml(cleanCode);
  const safePlanningUrl = escapeTradeShowEmailHtml(planningUrl);

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
    `Plan and design your banner: ${planningUrl}`,
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
              <td style="background:#0f2d5c;padding:26px 30px;text-align:center;">
                <img src="https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg" width="210" alt="Banners On The Fly" style="display:block;max-width:100%;height:auto;margin:0 auto;border:0;">
              </td>
            </tr>
            <tr>
              <td style="padding:32px 30px 8px;">
                <p style="margin:0 0 16px;font-size:17px;line-height:1.55;color:#172033;">Hi ${safeName},</p>
                <h1 style="margin:0 0 14px;font-size:27px;line-height:1.2;color:#0f2d5c;">Get your banners ready for ${safeEventName}</h1>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#46566d;">The show is scheduled for <strong>${safeDates}</strong> in <strong>${safeLocation}</strong>. When the deadline is close, we make ordering premium custom vinyl and mesh banners fast and straightforward.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;background:#f7f9fc;border-radius:12px;">
                  <tr><td style="padding:20px 22px;font-size:15px;line-height:1.9;color:#25344b;">
                    <strong style="color:#0f2d5c;">✓</strong> Premium custom vinyl and mesh banners<br>
                    <strong style="color:#0f2d5c;">✓</strong> 24-hour production<br>
                    <strong style="color:#0f2d5c;">✓</strong> Free Next-Day Air delivery<br>
                    <strong style="color:#0f2d5c;">✓</strong> Fast online ordering for trade-show deadlines
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
                    <a href="${safePlanningUrl}" style="display:inline-block;padding:15px 24px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;">Plan &amp; Design Your Banner</a>
                  </td></tr>
                </table>
                <p style="margin:0 0 24px;text-align:center;font-size:13px;line-height:1.5;color:#6b778a;">Use the planning page to organize your banner, then confirm event details and exhibitor rules directly with the organizer.</p>
              </td>
            </tr>
            <tr><td style="padding:22px 30px;background:#f7f9fc;text-align:center;font-size:12px;line-height:1.6;color:#718096;">Banners On The Fly · Premium custom vinyl and mesh banners<br><a href="${SITE_URL}" style="color:#18448d;">bannersonthefly.com</a></td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text, eventDates, planningUrl };
}
