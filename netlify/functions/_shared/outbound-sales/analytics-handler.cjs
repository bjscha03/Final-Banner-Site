'use strict';

const { createSql, getDatabaseUrl, isMissingOutboundSchema } = require('./database.cjs');
const { listCampaigns } = require('./campaign-repository.cjs');
const { listPerformance } = require('./performance.cjs');
const { listAttributedOrders } = require('./attribution.cjs');
const { listErrors } = require('./monitoring.cjs');
const { appendAudit } = require('./audit.cjs');
const { csvCell } = require('./prospects-handler.cjs');
const { json, authorize, safeFailure } = require('./security.cjs');

const VIEWS = new Set(['campaigns','performance','orders','errors','costs','learning']);

function ordersCsv(orders) {
  const headers=['attribution_id','source_order_id','prospect_id','business_name','opportunity_id','message_id','campaign_id','campaign_name','attribution_method','attribution_confidence','gross_revenue_cents','attributed_revenue_cents','currency','source_order_status','ordered_at','attributed_at'];
  const rows=orders.map((o)=>[o.id,o.sourceOrderId,o.prospectId,o.businessName,o.opportunityId,o.messageId,o.campaignId,o.campaignName,o.attributionMethod,o.attributionConfidence,o.grossRevenueCents,o.attributedRevenueCents,o.currency,o.sourceOrderStatus,o.orderedAt,o.attributedAt]);
  return [headers.map(csvCell).join(','),...rows.map((row)=>row.map(csvCell).join(','))].join('\r\n');
}

async function loadCostAnalytics(sql) {
  const [ai,providers,resend,ledger]=await Promise.all([
    sql(`SELECT model,purpose,status,COUNT(*)::int AS requests,COALESCE(SUM(input_tokens),0)::bigint AS input_tokens,COALESCE(SUM(cached_input_tokens),0)::bigint AS cached_input_tokens,COALESCE(SUM(output_tokens),0)::bigint AS output_tokens,COALESCE(SUM(COALESCE(actual_cost_microusd,estimated_cost_microusd)),0)::bigint AS cost_microusd,COALESCE(AVG(latency_ms),0)::int AS average_latency_ms FROM outbound_ai_usage WHERE created_at>=date_trunc('month',NOW()) GROUP BY model,purpose,status ORDER BY cost_microusd DESC`),
    sql(`SELECT provider_id,provider_kind,operation,status,SUM(request_count)::int AS requests,SUM(result_count)::int AS results,COALESCE(SUM(provider_credits),0) AS credits,COALESCE(SUM(COALESCE(actual_cost_microusd,estimated_cost_microusd)),0)::bigint AS cost_microusd FROM outbound_provider_usage WHERE created_at>=date_trunc('month',NOW()) GROUP BY provider_id,provider_kind,operation,status ORDER BY cost_microusd DESC`),
    sql(`SELECT event_type,COUNT(*)::int AS events FROM outbound_email_events WHERE event_at>=date_trunc('month',NOW()) GROUP BY event_type ORDER BY event_type`),
    sql(`SELECT category,status,COUNT(*)::int AS entries,COALESCE(SUM(CASE WHEN status='committed' THEN COALESCE(actual_cost_microusd,estimated_cost_microusd) WHEN status='reserved' THEN estimated_cost_microusd ELSE 0 END),0)::bigint AS cost_microusd FROM outbound_cost_ledger WHERE occurred_at>=date_trunc('month',NOW()) GROUP BY category,status ORDER BY category,status`),
  ]);
  const numericFields = /requests|results|tokens|microusd|latency|events|entries/;
  const numeric=(rows)=>rows.map((row)=>Object.fromEntries(
    Object.entries(row).map(([key,value])=>[key,numericFields.test(key)?Number(value)||0:value]),
  ));
  return {openAIUsage:numeric(ai),providerUsage:numeric(providers),resendUsage:numeric(resend),ledger:numeric(ledger)};
}

function emptyAnalyticsData(view) {
  if (view === 'orders') return { orders:[],summary:{orderCount:0,revenueCents:0,pendingCandidates:0},limit:100,offset:0 };
  if (view === 'errors') return { alerts:[],jobs:[],inboundEvents:[],limit:100,offset:0 };
  if (view === 'costs') return { openAIUsage:[],providerUsage:[],resendUsage:[],ledger:[] };
  return [];
}

async function loadLearning(sql){
  const rows=await sql(`SELECT id,dimension_type,dimension_key,recommendation,current_weight,recommended_weight,sample_size,primary_metric,evidence,safety_metrics,status,applied_at,created_at FROM outbound_learning_recommendations ORDER BY created_at DESC LIMIT 500`);
  return rows.map((row)=>({id:row.id,dimensionType:row.dimension_type,dimensionKey:row.dimension_key,recommendation:row.recommendation,currentWeight:Number(row.current_weight),recommendedWeight:Number(row.recommended_weight),sampleSize:Number(row.sample_size),primaryMetric:row.primary_metric,evidence:row.evidence||{},safetyMetrics:row.safety_metrics||{},status:row.status,appliedAt:row.applied_at,createdAt:row.created_at}));
}

function createAnalyticsHandler(dependencies={}){
  return async function handler(event){
    if(event.httpMethod==='OPTIONS')return json(200,{ok:true});
    const auth=authorize(event);if(auth.response)return auth.response;
    if(event.httpMethod!=='GET')return json(405,{ok:false,error:'METHOD_NOT_ALLOWED',message:'Use GET.'},{Allow:'GET, OPTIONS'});
    const view=String(event.queryStringParameters?.view||'performance').toLowerCase();
    if(!VIEWS.has(view))return json(400,{ok:false,error:'INVALID_ANALYTICS_VIEW',message:'Analytics view is invalid.'});
    if(!getDatabaseUrl())return json(200,{ok:true,schemaReady:false,shadowMode:true,liveSending:false,view,data:emptyAnalyticsData(view)});
    try{
      const sql=(dependencies.createSql||createSql)();let data;
      if(view==='campaigns')data=await(dependencies.listCampaigns||listCampaigns)(sql);
      else if(view==='performance')data=await(dependencies.listPerformance||listPerformance)(sql,{days:Number(event.queryStringParameters?.days)});
      else if(view==='orders')data=await(dependencies.listAttributedOrders||listAttributedOrders)(sql,{limit:event.queryStringParameters?.format==='csv'?5000:Number(event.queryStringParameters?.limit),offset:Number(event.queryStringParameters?.offset)});
      else if(view==='errors')data=await(dependencies.listErrors||listErrors)(sql,{limit:Number(event.queryStringParameters?.limit),offset:Number(event.queryStringParameters?.offset)});
      else if(view==='costs')data=await(dependencies.loadCostAnalytics||loadCostAnalytics)(sql);
      else data=await(dependencies.loadLearning||loadLearning)(sql);
      if(view==='orders'&&String(event.queryStringParameters?.format||'').toLowerCase()==='csv'){
        await (dependencies.appendAudit||appendAudit)(sql,{
          actorType:'admin',actorId:auth.session.email||auth.session.sub||null,
          action:'attributed_orders.exported',entityType:'order_attribution',
          metadata:{rowCount:data.orders.length},requestId:event?.headers?.['x-nf-request-id']||null,
        });
        return{statusCode:200,headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="outbound-attributed-orders.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',Vary:'Authorization, X-Banners-Admin-Session, Cookie'},body:ordersCsv(data.orders)};
      }
      return json(200,{ok:true,schemaReady:true,shadowMode:true,liveSending:false,view,data});
    }catch(error){
      if(isMissingOutboundSchema(error))return json(200,{ok:true,schemaReady:false,shadowMode:true,liveSending:false,view,data:emptyAnalyticsData(view)});
      return safeFailure(error);
    }
  };
}

module.exports={VIEWS,ordersCsv,loadCostAnalytics,loadLearning,emptyAnalyticsData,createAnalyticsHandler,handler:createAnalyticsHandler()};
