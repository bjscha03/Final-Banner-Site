'use strict';

const runtime = require('./runtime.cjs');

// Read account and owned-number metadata only. Never buy, update or send.
async function inspect(config = runtime.settings(), makeClient = runtime.client) {
  if (!config.accountSid || !config.authToken) return { status: 'missing_credentials' };
  if (!/^AC[a-f0-9]{32}$/i.test(config.accountSid) || config.authToken.length < 20) {
    return { status: 'invalid_credentials' };
  }
  try {
    const client = makeClient(config);
    const account = await client.api.accounts(config.accountSid).fetch();
    const selected = runtime.isPhone(config.phoneNumber);
    const numbers = await client.incomingPhoneNumbers.list(selected
      ? { phoneNumber: config.phoneNumber, limit: 2 } : { limit: 20 });
    const originAllowed = /^https:\/\/(?:bannersonthefly\.com|[a-z0-9-]+--bannersonthefly\.netlify\.app)$/.test(config.origin);
    const target = `${config.origin}/api/twilio/inbound`;
    const owned = numbers.find(number => number.phoneNumber === config.phoneNumber);
    return {
      status: 'connected',
      accountType: account.type === 'Trial' ? 'Trial' : account.type === 'Full' ? 'Full' : 'Unknown',
      accountActive: account.status === 'active',
      numbers: numbers.map(number => ({ phoneNumber: number.phoneNumber,
        sms: number.capabilities?.sms === true, mms: number.capabilities?.mms === true })),
      listMayBeIncomplete: !selected && numbers.length === 20,
      selectedNumberConfigured: selected,
      selectedNumberOwned: Boolean(owned),
      selectedNumberCapable: Boolean(owned?.capabilities?.sms && owned?.capabilities?.mms),
      routingMatches: Boolean(originAllowed && owned?.smsUrl === target && owned?.smsMethod === 'POST'),
    };
  } catch (failure) {
    // Provider errors can contain URLs, identifiers or credentials. Return only
    // a fixed result; the admin does not need the raw exception or token.
    return { status: Number(failure?.status) === 401 ? 'authentication_failed' : 'unavailable' };
  }
}

module.exports = { inspect };
