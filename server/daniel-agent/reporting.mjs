import {easternDate} from './policy.mjs';
export async function report(sql,day=easternDate(new Date())){
 const [metrics]=await sql`SELECT count(*) FILTER(WHERE status='sent')::int AS sent,count(*) FILTER(WHERE status='simulated')::int AS simulated,count(*) FILTER(WHERE direction='inbound')::int AS received,count(*) FILTER(WHERE status='uncertain')::int AS uncertain FROM daniel_sales.messages WHERE (coalesce(sent_at,created_at) AT TIME ZONE 'America/New_York')::date=${day}::date`;
 const stages=await sql`SELECT stage,count(*)::int AS count FROM daniel_sales.opportunities GROUP BY stage`;
 const [pending]=await sql`SELECT count(*)::int AS count FROM daniel_sales.approvals WHERE decision='pending'`;
 const [overdue]=await sql`SELECT count(*)::int AS count FROM daniel_sales.opportunities WHERE next_action_at<now() AND stage NOT IN ('won','lost','do_not_contact')`;
 const [suppressed]=await sql`SELECT count(*)::int AS count FROM daniel_sales.suppressions`;
 const data={date:day,timezone:'America/New_York',...metrics,stages,pendingApprovals:pending.count,overdueActions:overdue.count,suppressed:suppressed.count,note:'Sent means Gmail accepted the message, not confirmed delivery. Won is a CRM stage, not recorded revenue. Simulated messages never leave the preview.'};
 await sql`INSERT INTO daniel_sales.daily_reports(local_date,data) VALUES(${day}::date,${JSON.stringify(data)}::jsonb) ON CONFLICT(local_date) DO UPDATE SET data=excluded.data,generated_at=now()`;return data;
}
