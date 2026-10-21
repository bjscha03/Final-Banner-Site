// Read-only dashboard data. Use only from authenticated server routes.
export async function dashboardData(sql){
 const [counts,opportunities,tasks,recent]=await Promise.all([
 sql`SELECT stage,count(*)::int AS total FROM daniel_sales.opportunities GROUP BY stage`,
 sql`SELECT o.id,o.stage,o.product_interest,o.estimated_quantity,o.next_action,o.next_action_at,a.name AS account FROM daniel_sales.opportunities o JOIN daniel_sales.accounts a ON a.id=o.account_id WHERE o.stage NOT IN ('won','lost','do_not_contact') ORDER BY o.next_action_at ASC LIMIT 100`,
 sql`SELECT t.id,t.kind,t.due_at,t.status,a.name AS account FROM daniel_sales.tasks t LEFT JOIN daniel_sales.opportunities o ON o.id=t.opportunity_id LEFT JOIN daniel_sales.accounts a ON a.id=o.account_id WHERE t.status='pending' ORDER BY t.due_at LIMIT 100`,
 sql`SELECT direction,classification,status,created_at FROM daniel_sales.messages ORDER BY created_at DESC LIMIT 30`
 ]);
 return {counts,opportunities,tasks,recent};
}
