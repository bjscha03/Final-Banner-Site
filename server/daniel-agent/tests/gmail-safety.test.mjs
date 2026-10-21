import test from 'node:test';
import assert from 'node:assert/strict';
import { gmailTestRecipients, mode, environment } from '../config.mjs';
import { gmailRequest } from '../gmail.mjs';
test('function runtime deployment context is used without a build-only variable',()=>{
  assert.equal(environment({deploy:{context:'deploy-preview'}}).CONTEXT,'deploy-preview');
  assert.equal(mode({...environment({deploy:{context:'deploy-preview'}}),DANIEL_AGENT_MODE:'live',DANIEL_CUTOVER_APPROVED:'true'}),'preview');
});
test('real Gmail acceptance permission is exact, bounded, preview-only and never cutover', () => {
  const now = new Date();
  const env = { CONTEXT:'deploy-preview', DANIEL_GMAIL_TEST_UNTIL:new Date(+now+3600000).toISOString(), DANIEL_GMAIL_TEST_RECIPIENTS:'owner@example.com' };
  assert.deepEqual(gmailTestRecipients(env,now), ['owner@example.com']);
  assert.equal(mode(env),'preview');
  assert.deepEqual(gmailTestRecipients({...env,CONTEXT:'production'},now), []);
  assert.deepEqual(gmailTestRecipients({...env,DANIEL_GMAIL_TEST_RECIPIENTS:'*@example.com'},now), []);
  assert.deepEqual(gmailTestRecipients({...env,DANIEL_GMAIL_TEST_UNTIL:new Date(+now-1).toISOString()},now), []);
  assert.deepEqual(gmailTestRecipients({...env,DANIEL_GMAIL_TEST_UNTIL:new Date(+now+172800000).toISOString()},now), []);
});
test('Gmail errors explain disabled APIs without exposing provider content', async t => {
  t.mock.method(globalThis,'fetch',async()=>Response.json({error:{message:'private token do not expose',details:[{reason:'SERVICE_DISABLED'}]}},{status:403}));
  await assert.rejects(gmailRequest('test-token','/profile'),e=>e.status===403 && /Enable the Gmail API/.test(e.message) && !/private token/.test(e.message));
});
