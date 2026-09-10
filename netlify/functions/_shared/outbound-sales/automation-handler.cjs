'use strict';

const crypto = require('node:crypto');
const { createSql, getDatabaseUrl } = require('./database.cjs');
const { getRuntimeConfig } = require('./config.cjs');
const { runAutomationCycle } = require('./automation.cjs');

function automationAuthorized(event, env = process.env) {
  const expected = String(env.OUTBOUND_AUTOMATION_SECRET || '');
  const authorization = String(event?.headers?.authorization || event?.headers?.Authorization || '');
  const presented = String(event?.headers?.['x-outbound-automation-token'] || authorization.replace(/^Bearer\s+/i, ''));
  if (expected.length < 32 || presented.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

function createAutomationHandler(dependencies={}){
  return async function handler(event){
    if(event.httpMethod!=='POST')return{statusCode:405,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',Allow:'POST'},body:JSON.stringify({ok:false,error:'METHOD_NOT_ALLOWED'})};
    const runtime=(dependencies.getRuntimeConfig||getRuntimeConfig)();
    // Production is hard-blocked in code. Return before database access,
    // provider construction, OpenAI construction, or Resend construction.
    if(!runtime.shadowAutomationAvailable||!getDatabaseUrl())return{statusCode:204,headers:{'Cache-Control':'no-store'},body:''};
    if (!(dependencies.automationAuthorized || automationAuthorized)(event, process.env)) {
      return { statusCode: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ ok: false, error: 'UNAUTHORIZED' }) };
    }
    try{const result=await(dependencies.runAutomationCycle||runAutomationCycle)({sql:(dependencies.createSql||createSql)(),env:process.env,requestId:event?.headers?.['x-nf-request-id']||null,dependencies:dependencies.cycleDependencies});return{statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({ok:true,shadowMode:true,liveSending:false,claimed:result.claimed})};}
    catch(error){console.error('[outbound-sales] shadow automation cycle unavailable',{code:String(error?.code||'AUTOMATION_FAILED').replace(/[^A-Z0-9_.-]/gi,'').slice(0,80)});return{statusCode:204,headers:{'Cache-Control':'no-store'},body:''};}
  };
}

module.exports={automationAuthorized,createAutomationHandler,handler:createAutomationHandler()};
