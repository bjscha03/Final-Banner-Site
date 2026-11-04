import test from 'node:test';
import assert from 'node:assert/strict';
import {replenishQualifiedIntroductions} from './qualified-intro-supply.mjs';

test('disabled automation never queries or creates introduction',async()=>{
 const sql=()=>{throw Error('should not query')};
 const result=await replenishQualifiedIntroductions(sql,{}, {paused:true,auto_prospect:true});
 assert.equal(result.status,'disabled');
});
test('no eligible qualified drafts does not generate or send',async()=>{
 let calls=0;
 const sql=async()=>{calls++;return []};
 const result=await replenishQualifiedIntroductions(sql,{}, {paused:false,cold_outreach_paused:false,auto_prospect:true});
 assert.equal(result.status,'no_eligible_qualified_drafts');
 assert.equal(calls,1);
});
