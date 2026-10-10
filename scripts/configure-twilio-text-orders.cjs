#!/usr/bin/env node
'use strict';

// Run in a trusted terminal with credentials supplied as environment variables.
// Default is a read-only preflight. --apply changes routing on the owned number.
const twilio = require('twilio');
const { settings } = require('../netlify/functions/_shared/sms/runtime.cjs');
const preflight = require('../netlify/functions/_shared/sms/preflight.cjs');
async function main() {
  const config = settings();
  const result = await preflight.inspect(config);
  if (result.status !== 'connected') {
    throw new Error(`Twilio connection check: ${result.status}. Check the private TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN settings.`);
  }
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ ...result, applied: false }, null, 2));
    return;
  }
  if (!result.accountActive || !result.selectedNumberOwned || !result.selectedNumberCapable) {
    throw new Error('Set BOF_SMS_SETTINGS with an owned SMS/MMS-capable U.S. number on an active account.');
  }
  if (result.accountType !== 'Full') throw new Error('Complete account upgrade and number verification before applying production routing.');
  if (!/^https:\/\/(?:bannersonthefly\.com|[a-z0-9-]+--bannersonthefly\.netlify\.app)$/.test(config.origin)) throw new Error('Use the approved BOF site origin.');
  const client = twilio(config.accountSid, config.authToken, { autoRetry: false, timeout: 20000 });
  const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: config.phoneNumber, limit: 2 });
  if (numbers.length !== 1 || !numbers[0].capabilities?.sms || !numbers[0].capabilities?.mms) {
    throw new Error('The configured number must still be owned and SMS/MMS capable.');
  }
  const number = numbers[0];
  const target = `${config.origin}/api/twilio/inbound`;
  const updated = await client.incomingPhoneNumbers(number.sid).update({ smsUrl: target, smsMethod: 'POST',
    smsFallbackUrl: target, smsFallbackMethod: 'POST', smsApplicationSid: '' });
  if (updated.smsUrl !== target || updated.smsMethod !== 'POST') throw new Error('Webhook update could not be verified.');
  console.log(JSON.stringify({ ...result, routingMatches: true, applied: true }, null, 2));
}
main().catch(() => { console.error('Twilio setup could not be completed. Check credentials, account upgrade, number capability and verification.'); process.exitCode = 1; });
