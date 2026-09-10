'use strict';

const { sanitizeForAudit } = require('./security.cjs');
const { evaluateCircuitBreaker } = require('./delivery-safety.cjs');

async function collectHealth(sql, settings) {
  const [jobRows,messageRows,inboundRows,costRows,counterRows] = await Promise.all([
    sql(`SELECT COUNT(*) FILTER (WHERE status='dead')::int AS dead,COUNT(*) FILTER (WHERE status IN ('queued','retry') AND run_after<NOW()-INTERVAL '30 minutes')::int AS delayed,COUNT(*) FILTER (WHERE status='running' AND lease_expires_at<NOW())::int AS expired FROM outbound_jobs`),
    sql(`SELECT COUNT(*) FILTER (WHERE generation_status='failed' AND updated_at>=NOW()-INTERVAL '24 hours')::int AS generation_failed,COUNT(*) FILTER (WHERE delivery_state='failed' AND updated_at>=NOW()-INTERVAL '24 hours')::int AS delivery_failed FROM outbound_messages`),
    sql(`SELECT COUNT(*) FILTER (WHERE processing_status='failed' AND received_at>=NOW()-INTERVAL '24 hours')::int AS inbound_failed FROM outbound_inbound_events`),
    sql(`SELECT category,COALESCE(SUM(CASE WHEN status='committed' THEN COALESCE(actual_cost_microusd,estimated_cost_microusd) WHEN status='reserved' THEN estimated_cost_microusd ELSE 0 END),0)::bigint AS used FROM outbound_cost_ledger WHERE occurred_at>=date_trunc('month',NOW()) GROUP BY category`),
    sql(`SELECT * FROM outbound_daily_delivery_counters ORDER BY business_date DESC LIMIT 1`),
  ]);
  const jobs=jobRows[0]||{},messages=messageRows[0]||{},inbound=inboundRows[0]||{};
  const costs=Object.fromEntries(costRows.map((row)=>[row.category,Number(row.used)||0]));
  const breaker=evaluateCircuitBreaker(counterRows[0]||{},settings);
  const openAIStopMicrousd=Number(settings.monthlyOpenAIBudgetCents||800)*10000;
  const alerts=[];
  if(Number(jobs.dead)>0)alerts.push({severity:'critical',code:'DEAD_LETTER_JOBS',component:'jobs',summary:'Outbound jobs reached dead-letter state.',metadata:{count:Number(jobs.dead)}});
  if(Number(jobs.expired)>0)alerts.push({severity:'warning',code:'EXPIRED_JOB_LEASES',component:'jobs',summary:'Outbound worker leases expired.',metadata:{count:Number(jobs.expired)}});
  if(Number(jobs.delayed)>10)alerts.push({severity:'warning',code:'JOB_QUEUE_DELAYED',component:'jobs',summary:'Outbound jobs are delayed.',metadata:{count:Number(jobs.delayed)}});
  if(Number(messages.generation_failed)>5)alerts.push({severity:'warning',code:'GENERATION_FAILURES_HIGH',component:'openai',summary:'Shadow personalization failures increased.',metadata:{count:Number(messages.generation_failed)}});
  if(Number(inbound.inbound_failed)>5)alerts.push({severity:'warning',code:'INBOUND_FAILURES_HIGH',component:'webhook',summary:'Inbound event failures increased.',metadata:{count:Number(inbound.inbound_failed)}});
  if(openAIStopMicrousd>0&&(costs.openai||0)>=openAIStopMicrousd*0.8)alerts.push({severity:'warning',code:'OPENAI_BUDGET_NEAR_STOP',component:'budget',summary:'Outbound OpenAI spend reached 80% of the local stop.',metadata:{usedMicrousd:costs.openai||0,stopMicrousd:openAIStopMicrousd}});
  if(breaker.state==='open')alerts.push({severity:'critical',code:breaker.reasons[0],component:'delivery',summary:'Outbound delivery circuit breaker is open.',metadata:breaker.metrics});
  return {jobs:{dead:Number(jobs.dead)||0,delayed:Number(jobs.delayed)||0,expired:Number(jobs.expired)||0},messages:{generationFailed:Number(messages.generation_failed)||0,deliveryFailed:Number(messages.delivery_failed)||0},inbound:{failed:Number(inbound.inbound_failed)||0},costs,circuitBreaker:breaker,alerts};
}

async function persistAlerts(sql, alerts) {
  const ids=[];
  for(const alert of alerts){
    const rows=await sql(`INSERT INTO outbound_operational_alerts (severity,alert_code,component,summary,diagnostic_metadata,status) VALUES ($1,$2,$3,$4,$5::jsonb,'open') ON CONFLICT (alert_code,component,status) DO UPDATE SET severity=EXCLUDED.severity,summary=EXCLUDED.summary,diagnostic_metadata=EXCLUDED.diagnostic_metadata,last_observed_at=NOW(),occurrence_count=outbound_operational_alerts.occurrence_count+1,updated_at=NOW() RETURNING id`,[alert.severity,alert.code,alert.component,alert.summary,JSON.stringify(sanitizeForAudit(alert.metadata||{}))]);
    if(rows[0])ids.push(rows[0].id);
  }
  return ids;
}

async function listErrors(sql,{limit=100,offset=0}={}){
  const safeLimit=Math.max(1,Math.min(5000,Number(limit)||100));const safeOffset=Math.max(0,Math.min(10000,Number(offset)||0));
  const [alerts,jobs,events]=await Promise.all([
    sql(`SELECT id,severity,alert_code,component,summary,diagnostic_metadata,status,first_observed_at,last_observed_at,occurrence_count FROM outbound_operational_alerts ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,last_observed_at DESC LIMIT $1 OFFSET $2`,[safeLimit,safeOffset]),
    sql(`SELECT id,job_type,status,attempt_count,max_attempts,last_error_code,last_error_message,run_after,updated_at FROM outbound_jobs WHERE status IN ('retry','dead') ORDER BY updated_at DESC LIMIT $1`,[Math.min(safeLimit,250)]),
    sql(`SELECT id,event_kind,event_type,processing_status,error_code,diagnostic_metadata,received_at,processed_at FROM outbound_inbound_events WHERE processing_status='failed' ORDER BY received_at DESC LIMIT $1`,[Math.min(safeLimit,250)]),
  ]);
  return {alerts:alerts.map((row)=>({...row,diagnostic_metadata:sanitizeForAudit(row.diagnostic_metadata||{})})),jobs:jobs.map((row)=>({...row,last_error_message:String(row.last_error_message||'').slice(0,1000)})),inboundEvents:events.map((row)=>({...row,diagnostic_metadata:sanitizeForAudit(row.diagnostic_metadata||{})})),limit:safeLimit,offset:safeOffset};
}

module.exports={collectHealth,persistAlerts,listErrors};
