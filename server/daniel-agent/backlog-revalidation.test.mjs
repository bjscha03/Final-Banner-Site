import test from 'node:test';
import assert from 'node:assert/strict';
import {revalidateBacklog} from './backlog-revalidation.mjs';

function fake(row){
 const writes=[];
 const sql=async(parts,...values)=>{
  const q=parts.join('?');
  if(q.includes('SELECT o.id AS opportunity_id'))return row?[row]:[];
  if(q.includes('INSERT INTO daniel_sales.audit_events')){writes.push({q,values});return [];}
  if(q.includes('UPDATE daniel_sales.contacts')){writes.push({q,values});return [];}
  if(q.includes('UPDATE daniel_sales.opportunities'))throw Error('Must not promote');
  return [];
 };
 return {sql,writes};
}
test('backlog with no eligible account does not call research or write',async()=>{
 const f=fake(null);
 const result=await revalidateBacklog(f.sql,{},'run-test',{research:()=>{throw Error('unexpected')}});
 assert.equal(result,null);
 assert.equal(f.writes.length,0);
});
test('missing official website is rejected and audited without promotion',async()=>{
 const f=fake({opportunity_id:'op-test',contact_id:'contact-test',account_id:'account-test',name:'Sample',website:null});
 const result=await revalidateBacklog(f.sql,{},'run-test',{research:()=>{throw Error('unexpected')}});
 assert.equal(result.status,'backlog_rejected');
 assert.equal(result.category,'missing_contact_or_website');
 assert.equal(f.writes.filter(x=>x.q.includes('INSERT INTO daniel_sales.audit_events')).length,1);
 assert.equal(f.writes.filter(x=>x.q.includes('UPDATE daniel_sales.contacts')).length,1);
});
