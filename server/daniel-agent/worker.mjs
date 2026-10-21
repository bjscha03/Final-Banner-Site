import {randomUUID} from 'node:crypto';
import {database} from './db.mjs';
import {accessToken} from './gmail.mjs';
import {syncMailbox} from './mail-sync.mjs';
import {dispatch,reconcile} from './dispatch.mjs';
import {generateDraft} from './ai.mjs';
import {saveDraft,requestApproval,audit} from './store.mjs';
import {report} from './reporting.mjs';
import {mode} from './config.mjs';
export async function runWorker(env=process.env,options={}){
 const sql=options.sql||database(env),owner=randomUUID();
 const [lock]=await sql`INSERT INTO daniel_sales.worker_locks(name,owner,expires_at) VALUES('worker',${owner},now()+interval '14 minutes') ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE daniel_sales.worker_locks.expires_at<now() RETURNING owner`;
 if(!lock)return {status:'busy',outboundSends:0};
 const [run]=await sql`INSERT INTO daniel_sales.runs(status) VALUES('running') RETURNING id`;
 let token,summary={mode:mode(env),sent:0,simulated:0};
 try{
 const [settings]=await sql`SELECT * FROM daniel_sales.settings WHERE id=1`;
 if(settings.paused){summary.status='paused';await report(sql);return summary;}
 const [box]=await sql`SELECT email,encrypted_refresh_token FROM daniel_sales.mailbox WHERE id=1`;
 if(box?.encrypted_refresh_token){try{token=await accessToken(env,sql);summary.inbox=await syncMailbox(sql,token);}catch(e){await sql`UPDATE daniel_sales.mailbox SET last_error=${'Mailbox sync failed; check Gmail connection'},last_sync_at=now() WHERE id=1`;summary.gmailError='Mailbox sync failed';if(mode(env)==='live')throw e;}}
 // Live dispatch cannot outrun inbox synchronization and miss an opt-out.
 if(mode(env)==='live'&&!token)throw Error('Live worker requires a connected mailbox');
 if(mode(env)==='live'&&!summary.inbox?.complete){summary.status='syncing';return summary;}
 summary.reconciliation=await reconcile(sql,env,token);
 const tasks=await sql`SELECT * FROM daniel_sales.tasks WHERE status='pending' AND due_at<=now() AND kind IN ('followup','reply') ORDER BY due_at LIMIT 3`;
 for(const t of tasks){
 const [c]=await sql`SELECT * FROM daniel_sales.contacts WHERE id=${t.contact_id}`;
 if(!c||c.suppressed_at||(t.kind==='followup'&&c.replied_at)){await sql`UPDATE daniel_sales.tasks SET status='cancelled' WHERE id=${t.id}`;continue;}
 const [existing]=await sql`SELECT id FROM daniel_sales.messages WHERE idempotency_key=${'task:'+t.id}`;
 if(existing){await requestApproval(sql,existing.id,'daniel-worker').catch(()=>{});await sql`UPDATE daniel_sales.tasks SET status='completed' WHERE id=${t.id}`;continue;}
 try{const draft=await generateDraft(sql,c.id,t.kind,env);const m=await saveDraft(sql,{...draft,idempotency_key:'task:'+t.id},'daniel-worker');await requestApproval(sql,m.id,'daniel-worker');await sql`UPDATE daniel_sales.tasks SET status='completed',attempt_count=attempt_count+1 WHERE id=${t.id}`;}
 catch(e){await sql`UPDATE daniel_sales.tasks SET attempt_count=attempt_count+1,due_at=now()+interval '1 hour',note='Draft generation failed; will retry' WHERE id=${t.id}`;summary.draftErrors=(summary.draftErrors||0)+1;}
 }
 Object.assign(summary,await dispatch(sql,env,token,options));summary.report=await report(sql);summary.status='completed';return summary;
 }catch(e){summary.status='failed';summary.error='Worker stopped safely; inspect connections and audit log';await audit(sql,'daniel-worker','worker_failed','run',run.id,{error_type:e.status||'runtime'});throw e;}
 finally{await sql`UPDATE daniel_sales.runs SET status=${summary.status||'completed'},completed_at=now(),summary=${JSON.stringify(summary)}::jsonb WHERE id=${run.id}`;await sql`DELETE FROM daniel_sales.worker_locks WHERE name='worker' AND owner=${owner}`;}
}
