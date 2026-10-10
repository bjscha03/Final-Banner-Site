#!/usr/bin/env node
'use strict';

// Run in a trusted terminal with credentials supplied as environment variables.
// Default is a read-only preflight. --apply changes routing on the owned number.
const twilio = require('twilio');
const { settings } = require('../netlify/functions/_shared/sms/runtime.cjs');
async function main() {
  const config = settings();
  if (!/^AC[a-f0-9]{32}$/i.test(config.accountSid) || config.authToken.length < 20 || !/^\+1[2-9]\d{9}$/.test(config.phoneNumber)) {
    throw new Error('Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and BOF_SMS_SETTINGS with the owned U.S. number. Keep enabled:false for preflight.');
  }
  if (!/^https:\/\/(?:bannersonthefly\.com|[a-z0-9-]+--bannersonthefly\.netlify\.app)$/.test(config.origin)) throw new Error('Use the approved BOF site origin.');
  const client = twilio(config.accountSid, config.authToken, { autoRetry: false });
  const account = await client.api.accounts(config.accountSid).fetch();
  const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: config.phoneNumber, limit: 2 });
  if (account.status !== 'active' || numbers.length !== 1 || !numbers[0].capabilities?.sms || !numbers[0].capabilities?.mms) {
    throw new Error('An active account and an owned SMS/MMS-capable number are required.');
  }
  const number = numbers[0];
  const target = `${config.origin}/api/twilio/inbound`;
  const result = { accountType: account.type, number: number.phoneNumber, sms: number.capabilities.sms,
    mms: number.capabilities.mms, currentWebhook: number.smsUrl, intendedWebhook: target, applied: false };
  if (process.argv.includes('--apply')) {
    if (account.type === 'Trial') throw new Error('Complete account upgrade and number verification before applying production routing.');
    const updated = await client.incomingPhoneNumbers(number.sid).update({ smsUrl: target, smsMethod: 'POST',
      smsFallbackUrl: target, smsFallbackMethod: 'POST', smsApplicationSid: '' });
    if (updated.smsUrl !== target || updated.smsMethod !== 'POST') throw new Error('Webhook update could not be verified.');
    result.applied = true;
  }
  console.log(JSON.stringify(result, null, 2));
}
main().catch(failure => { console.error(failure.message || 'Twilio setup failed.'); process.exitCode = 1; });
