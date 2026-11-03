import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../migrate.mjs';
export const TEST_NOW='2026-11-03T17:00:00.000Z';
// TEST ONLY: isolated in-memory PostgreSQL. No application import or Neon URL.
// Substitute only the clock source; execute the actual weekday, timezone,
// suppression, quota and pacing predicates unchanged.
export async function createTestDatabase({clock=TEST_NOW,pacing=false,strictContract=null}={}){
 const db=new PGlite();
 await db.exec("CREATE SCHEMA daniel_test; CREATE TABLE daniel_test.clock(value timestamptz NOT NULL); CREATE FUNCTION daniel_test.clock_now() RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT value FROM daniel_test.clock LIMIT 1 $$");
 await db.query('INSERT INTO daniel_test.clock(value) VALUES($1::timestamptz)',[new Date(+new Date(clock)-1000).toISOString()]);
 const clocked=text=>text.replace(/\b(?:clock_timestamp|now)\s*\(\s*\)/gi,'daniel_test.clock_now()');
 function sql(strings,...values){
  let text=typeof strings==='string'?strings:strings.reduce((a,s,i)=>a+(i?'$'+i:'')+s,'');
  if(typeof strings==='string')values=values[0] || [];
  text=clocked(text);
  return {q:{text,values},then(resolve,reject){return db.query(text,values).then(r=>r.rows).then(resolve,reject);}};
 }
 let installing=true;
 sql.transaction=async queries=>{
  const result=await db.transaction(async tx=>{
   const out=[];for(const p of queries)out.push((await tx.query(p.q.text,p.q.values)).rows);return out;
  });
  // Actual migrations occur sequentially. Preserve that ordering rather than
  // tying every knowledge record at the same artificial timestamp.
  if(installing)await db.exec("UPDATE daniel_test.clock SET value=value+interval '100 milliseconds'");
  return result;
 };
 await migrate(sql);installing=false;
 await db.query('UPDATE daniel_test.clock SET value=$1::timestamptz',[clock]);
 // PGlite is single-session; this is NOT a real concurrency proof.
 await db.exec('CREATE OR REPLACE FUNCTION pg_advisory_xact_lock(integer,integer) RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$');
 await sql`UPDATE daniel_sales.settings SET paused=false,cold_outreach_paused=false,auto_reply=false,reply_mode='manual_only',auto_followup=true,auto_prospect=true,intro_daily_limit=25,followup_daily_limit=15,outreach_pacing_enabled=${pacing},required_draft_contract=${strictContract} WHERE id=1`;
 return {db,sql,setClock:async value=>{await db.query('UPDATE daniel_test.clock SET value=$1::timestamptz',[new Date(value).toISOString()]);},close:()=>db.close()};
}
