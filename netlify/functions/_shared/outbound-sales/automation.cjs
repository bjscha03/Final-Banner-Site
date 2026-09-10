'use strict';

const crypto = require('node:crypto');
const { getRuntimeConfig, effectiveControlState } = require('./config.cjs');
const { loadFoundationSnapshot } = require('./repository.cjs');
const { enqueueJob, claimJobs, completeJob, failJob, releaseExpiredLeases } = require('./jobs.cjs');
const { runShadowDiscovery } = require('./discovery.cjs');
const { createDiscoveryAdapter, enabledDiscoveryProviderConfigs } = require('./providers/registry.cjs');
const { generateShadowPersonalization } = require('./personalization.cjs');
const { planShadowDelivery } = require('./delivery-planner.cjs');
const { planShadowFollowUps } = require('./follow-up.cjs');
const { scanAttributionCandidates, promoteExactAttributions } = require('./attribution.cjs');
const { aggregatePerformanceDate, listPerformance, learningRecommendationFromRows, saveLearningRecommendations, applyLearningRecommendations } = require('./performance.cjs');
const { loadAppliedIndustryStrategy, selectProspectingKeywords } = require('./prospecting-strategy.cjs');
const { collectHealth, persistAlerts } = require('./monitoring.cjs');
const { appendAudit } = require('./audit.cjs');

const AUTOMATION_JOB_TYPES = Object.freeze(['discover','generate','schedule','attribute_order','aggregate_metrics']);

function cycleKey(date = new Date()) { return date.toISOString().slice(0,13); }
function discoveryCycleKey(date = new Date()) { return date.toISOString().slice(0,10); }
function workerId(env=process.env){return `outbound-${String(env.DEPLOY_ID||env.COMMIT_REF||'local').slice(0,32)}-${crypto.randomBytes(4).toString('hex')}`;}

function assertShadowAutomation({runtime,controls,settings}){
  if(!runtime?.shadowAutomationAvailable||!controls?.outboundSalesEnabled||settings?.automationEnabled!==true||!controls.shadowModeEnabled||controls.liveSendingEnabled||controls.emergencyPaused){const error=new Error('Shadow automation is disabled.');error.code='AUTOMATION_CONTEXT_LOCKED';throw error;}
}

async function seedAutomationCycle(sql,{now=new Date(),keywords=[]}={}){
  const key=cycleKey(now);const discoveryKey=discoveryCycleKey(now);const jobs=[];
  for(const job of [
    {jobType:'discover',dedupeKey:`discover:${discoveryKey}`,priority:50,maxAttempts:3,payload:{limit:30,cycleKey:discoveryKey,keywords}},
    {jobType:'schedule',dedupeKey:`schedule:${key}`,priority:20,maxAttempts:3,payload:{cycleKey:key}},
    {jobType:'attribute_order',dedupeKey:`attribute:${key}`,priority:10,maxAttempts:3,payload:{sinceDays:90,cycleKey:key}},
    {jobType:'aggregate_metrics',dedupeKey:`metrics:${key}`,priority:5,maxAttempts:3,payload:{metricDate:now.toISOString().slice(0,10),cycleKey:key}},
  ])jobs.push(await enqueueJob(sql,job));
  return jobs.filter(Boolean);
}

async function handleDiscover(job,context){
  const providerConfigs=(context.dependencies.enabledDiscoveryProviderConfigs||enabledDiscoveryProviderConfigs)(context.snapshot.providerConfigs);
  if(!providerConfigs.length)return{skipped:true,reason:'PROVIDER_DISABLED',providers:[],prospects:[]};
  const createAdapter=context.dependencies.createDiscoveryAdapter||createDiscoveryAdapter;
  const discover=context.dependencies.runShadowDiscovery||runShadowDiscovery;
  const requestedLimit=Number(job.payload?.limit);
  const maximum=Math.min(30,Math.max(1,Number.isFinite(requestedLimit)?Math.floor(requestedLimit):30));
  let remaining=maximum;
  const providers=[];
  const prospects=[];
  for(const providerConfig of providerConfigs){
    if(remaining<=0)break;
    const adapter=createAdapter(providerConfig.id,{env:context.env,fetchImpl:context.dependencies.fetch});
    const result=await discover({
      sql:context.sql,provider:adapter,providerEnabled:true,controls:context.controls,
      request:{requestKey:`${job.dedupe_key}:${providerConfig.id}`,limit:remaining,page:1,locations:job.payload?.locations||[],keywords:job.payload?.keywords||[]},
      dependencies:context.dependencies.discoveryDependencies,
    });
    const accounted=Math.min(remaining,Math.max(0,Number(result.usage?.resultCount)||0));
    remaining-=accounted;
    providers.push({providerId:providerConfig.id,skipped:result.skipped===true,reason:result.reason||null,resultCount:accounted});
    for(const prospect of result.prospects||[]){
      prospects.push(prospect);
      if(prospect.status==='ready_for_outreach')await enqueueJob(context.sql,{jobType:'generate',dedupeKey:`generate:${prospect.prospectId}:${job.dedupe_key}`,priority:30,maxAttempts:3,payload:{prospectId:prospect.prospectId}});
    }
  }
  return{skipped:false,maximumRecords:maximum,recordsAccounted:maximum-remaining,providers,prospects};
}

async function handleGenerate(job,context){
  if(!context.controls.shadowGenerationEnabled)return{skipped:true,reason:'SHADOW_GENERATION_DISABLED'};
  return(context.dependencies.generateShadowPersonalization||generateShadowPersonalization)({sql:context.sql,prospectId:job.payload?.prospectId,controls:context.controls,env:context.env,requestId:job.id,dependencies:context.dependencies.personalizationDependencies});
}

async function handleSchedule(job,context){const delivery=await(context.dependencies.planShadowDelivery||planShadowDelivery)({sql:context.sql,controls:context.controls,settings:context.snapshot.settings,now:context.now,requestId:job.id,dependencies:context.dependencies.deliveryDependencies});const followUps=await(context.dependencies.planShadowFollowUps||planShadowFollowUps)({sql:context.sql,controls:context.controls,requestId:job.id,dependencies:context.dependencies.followUpDependencies});return{delivery,followUps,externalEmailsSent:0};}

async function handleAttribution(job,context){
  if(context.snapshot.settings.attributionEnabled!==true)return{skipped:true,reason:'ATTRIBUTION_DISABLED'};
  const candidates=await(context.dependencies.scanAttributionCandidates||scanAttributionCandidates)(context.sql,{sinceDays:job.payload?.sinceDays});
  const promoted=await(context.dependencies.promoteExactAttributions||promoteExactAttributions)(context.sql);
  return{candidateCount:candidates.length,promotedCount:promoted.length,legacyOrdersMutated:false};
}

async function handleMetrics(job,context){
  const date=job.payload?.metricDate||context.now.toISOString().slice(0,10);
  await(context.dependencies.aggregatePerformanceDate||aggregatePerformanceDate)(context.sql,date);
  const performance=await(context.dependencies.listPerformance||listPerformance)(context.sql,{days:90});
  let recommendations=[];
  let applied=[];
  if(context.snapshot.settings.learningEnabled===true){recommendations=(context.dependencies.learningRecommendationFromRows||learningRecommendationFromRows)(performance,{minimumSample:context.snapshot.settings.minimumLearningSample,objective:'revenue',safetyLimits:context.snapshot.settings});await(context.dependencies.saveLearningRecommendations||saveLearningRecommendations)(context.sql,recommendations);applied=await(context.dependencies.applyLearningRecommendations||applyLearningRecommendations)(context.sql,{minimumSample:context.snapshot.settings.minimumLearningSample,explorationPercent:context.snapshot.settings.explorationPercent});}
  if(applied.length)await(context.dependencies.appendAudit||appendAudit)(context.sql,{action:'learning.recommendations_applied',entityType:'learning_cycle',entityId:date,newValues:{appliedCount:applied.length},metadata:{recommendations:applied,minimumSample:context.snapshot.settings.minimumLearningSample,explorationPercent:context.snapshot.settings.explorationPercent}});
  const health=await(context.dependencies.collectHealth||collectHealth)(context.sql,context.snapshot.settings);
  if(context.snapshot.settings.monitoringEnabled===true)await(context.dependencies.persistAlerts||persistAlerts)(context.sql,health.alerts);
  return{metricDate:date,recommendationCount:recommendations.length,appliedRecommendationCount:applied.length,alertCount:health.alerts.length};
}

async function dispatchJob(job,context){
  if(job.job_type==='discover')return handleDiscover(job,context);
  if(job.job_type==='generate')return handleGenerate(job,context);
  if(job.job_type==='schedule')return handleSchedule(job,context);
  if(job.job_type==='attribute_order')return handleAttribution(job,context);
  if(job.job_type==='aggregate_metrics')return handleMetrics(job,context);
  const error=new Error('Unsupported automation job.');error.code='UNSUPPORTED_AUTOMATION_JOB';throw error;
}

async function runAutomationCycle(options){
  const env=options.env||process.env;const runtime=(options.dependencies?.getRuntimeConfig||getRuntimeConfig)(env);
  const snapshot=await(options.dependencies?.loadFoundationSnapshot||loadFoundationSnapshot)(options.sql);
  const controls=effectiveControlState(snapshot.settings,runtime);assertShadowAutomation({runtime,controls,settings:snapshot.settings});
  const dependencies=options.dependencies||{};await(dependencies.releaseExpiredLeases||releaseExpiredLeases)(options.sql);
  const learnedStrategy=snapshot.settings.learningEnabled===true?await(dependencies.loadAppliedIndustryStrategy||loadAppliedIndustryStrategy)(options.sql):[];
  const targetingKeywords=(dependencies.selectProspectingKeywords||selectProspectingKeywords)(learnedStrategy,{seed:cycleKey(options.now),limit:3});
  await seedAutomationCycle(options.sql,{now:options.now,keywords:targetingKeywords});
  const owner=options.workerId||workerId(env);const jobs=await(dependencies.claimJobs||claimJobs)(options.sql,{workerId:owner,jobTypes:AUTOMATION_JOB_TYPES,limit:Math.min(10,Number(options.limit)||10),leaseSeconds:600});
  const results=[];
  for(const job of jobs){
    try{const result=await dispatchJob(job,{sql:options.sql,env,runtime,snapshot,controls,dependencies,now:options.now||new Date()});await(dependencies.completeJob||completeJob)(options.sql,{jobId:job.id,workerId:owner});results.push({jobId:job.id,type:job.job_type,status:'succeeded',result});}
    catch(error){const failed=await(dependencies.failJob||failJob)(options.sql,{jobId:job.id,workerId:owner,attemptCount:job.attempt_count,error});results.push({jobId:job.id,type:job.job_type,status:failed?.status||'failed',errorCode:String(error?.code||'JOB_FAILED').slice(0,100)});}
  }
  await(dependencies.appendAudit||appendAudit)(options.sql,{action:'automation.shadow_cycle_completed',entityType:'automation_cycle',entityId:cycleKey(options.now),newValues:{claimed:jobs.length,succeeded:results.filter((r)=>r.status==='succeeded').length},metadata:{shadowMode:true,liveSending:false,externalEmailsSent:0},requestId:options.requestId||null});
  return{shadowMode:true,liveSending:false,claimed:jobs.length,results};
}

module.exports={AUTOMATION_JOB_TYPES,cycleKey,discoveryCycleKey,workerId,assertShadowAutomation,seedAutomationCycle,handleDiscover,handleGenerate,handleSchedule,handleAttribution,handleMetrics,dispatchJob,runAutomationCycle};
