import { date, text, uuid, fail } from "./validation.mjs";
import { audit } from "./store.mjs";
export function nextBusinessFollowup(value) {
  const d = new Date(value);
  let n = 0;
  while (n < 5) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: "America/New_York",
    }).format(d);
    if (day !== "Sat" && day !== "Sun") n++;
  }
  return d.toISOString();
}
export async function scheduleMeeting(sql, input, actor) {
  const start = date(input.starts_at),
    end = date(input.ends_at);
  if (end <= start) fail("Meeting end must follow start");
  const title = text(input.title, "Meeting title", 200),
    op = uuid(input.opportunity_id);
  const [m] =
    await sql`INSERT INTO daniel_sales.meetings(opportunity_id,title,starts_at,ends_at,location,notes) SELECT ${op},${title},${start},${end},${String(input.location || "").slice(0, 1000)},${String(input.notes || "").slice(0, 2000)} WHERE NOT EXISTS(SELECT 1 FROM daniel_sales.meetings WHERE status='scheduled' AND starts_at<${end}::timestamptz AND ends_at>${start}::timestamptz) RETURNING *`;
  if (!m) fail("This time conflicts with a scheduled meeting", 409);
  await audit(sql, actor, "meeting_scheduled", "meeting", m.id);
  return m;
}
export function ics(m) {
  const esc = (s) =>
    String(s)
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/[,;]/g, "\\$&")
      .replace(/\r/g, "");
  const stamp = (d) =>
    new Date(d)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Banners On The Fly//Daniel//EN",
    "BEGIN:VEVENT",
    "UID:" + m.id + "@bannersonthefly.com",
    "DTSTAMP:" + stamp(new Date()),
    "DTSTART:" + stamp(m.starts_at),
    "DTEND:" + stamp(m.ends_at),
    "SUMMARY:" + esc(m.title),
    "LOCATION:" + esc(m.location),
    "DESCRIPTION:" + esc(m.notes),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
