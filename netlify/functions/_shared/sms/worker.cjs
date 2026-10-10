'use strict';

const crypto = require('node:crypto');
const store = require('./store.cjs');
const conversation = require('./conversation.cjs');
const artwork = require('./artwork.cjs');
const payments = require('./payments.cjs');
const runtime = require('./runtime.cjs');

const STOP = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT']);
const START = new Set(['START', 'UNSTOP']);
function sessionIdFor(sid) {
  const hex = crypto.createHash('sha256').update(`bof-sms-session:${sid}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}
function previewReply(session, config) {
  const fit = session.config.fit_mode === 'fit' ? 'Full image with white space where needed.' : 'Image cropped to fill the banner.';
  return `Banners On The Fly preview: ${conversation.summary(session)}\n${fit} Check every detail. Reply APPROVE, FIT (full image), FILL (crop), or RESTART. View: ${runtime.orderUrl(session, config)}`;
}
function approvalReply(session, config) {
  return `BOF: Artwork approved. ${conversation.summary(session)}\nEnter shipping details and pay securely: ${runtime.orderUrl(session, config)}\nNever text card details. Reply RESTART to change your order before payment.`;
}
function welcome() {
  return `Banners On The Fly: Let's order your banner. Automated order texts; frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. Terms: https://bannersonthefly.com/terms\n${conversation.PROMPTS.SIZE}`;
}

async function processInbound(sql, message, config, dependencies = {}) {
  const body = String(message.payload.Body || '').trim();
  const command = body.toUpperCase();
  const optOut = String(message.payload.OptOutType || '').toUpperCase();
  if (!runtime.allowedRecipient(message.phone, config)) return store.finishInbound(sql, message, 'SMS_RECIPIENT_NOT_ALLOWED');
  if (STOP.has(command) || optOut === 'STOP') {
    await store.setOptOut(sql, message.phone, true);
    // Twilio sends its own STOP acknowledgement. Do not send another message.
    return store.finishInbound(sql, message);
  }
  if (START.has(command) || optOut === 'START') {
    await store.setOptOut(sql, message.phone, false);
    return store.finishInbound(sql, message);
  }
  if (await store.optedOut(sql, message.phone)) return store.finishInbound(sql, message, 'SMS_OPTED_OUT');
  if (command === 'HELP' || command === 'INFO' || optOut === 'HELP') {
    if (optOut !== 'HELP') await store.queueReply(sql, { key: `help:${message.sid}`, phone: message.phone,
      body: 'Banners On The Fly banner ordering. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out. Help: support@bannersonthefly.com or https://bannersonthefly.com/contact.' });
    return store.finishInbound(sql, message);
  }

  let session = message.session_id ? await store.getSession(sql, message.session_id) : await store.activeSession(sql, message.phone);
  if (message.session_id && (!session || session.phone !== message.phone || new Date(session.expires_at) <= new Date())) {
    return store.finishInbound(sql, message, 'SMS_SESSION_EXPIRED');
  }
  if (['PAID', 'CANCELED'].includes(session?.step)) return store.finishInbound(sql, message, 'SMS_SESSION_CLOSED');
  const startingSession = await store.getSession(sql, sessionIdFor(message.sid));
  if (startingSession && !startingSession.last_inbound_sid && startingSession.phone === message.phone && startingSession.step === 'SIZE') {
    return store.commitInbound(sql, message, startingSession, {}, welcome());
  }
  if (command === 'RESTART' && session) {
    try {
      await (dependencies.cancelCheckout || payments.cancelCheckout)(sql, session, { rawUrl: config.origin, headers: { host: new URL(config.origin).host } }, config);
    } catch (failure) {
      if (Number(failure.statusCode) >= 400 && Number(failure.statusCode) < 500) {
        await store.queueReply(sql, { key: `restart-blocked:${message.sid}`, session, body: `BOF: ${failure.message}` });
        return store.finishInbound(sql, message, failure.code);
      }
      throw failure;
    }
    session = null;
  }
  if (!session) {
    session = await store.createSession(sql, message.phone, sessionIdFor(message.sid));
    return store.commitInbound(sql, message, session, {}, welcome());
  }
  if (await store.sessionCount(sql, session.id) >= config.sessionMessages) {
    await store.queueReply(sql, { key: `limit:${session.id}`, session,
      body: 'BOF: This text conversation reached its message limit. Please order at https://bannersonthefly.com or contact support@bannersonthefly.com for help.' });
    return store.finishInbound(sql, message, 'SMS_SESSION_LIMIT');
  }
  if (message.payload.expectedRevision !== undefined && Number(message.payload.expectedRevision) !== session.revision) {
    return store.finishInbound(sql, message, 'SMS_SESSION_CHANGED');
  }
  if (session.checkout_lock_until && new Date(session.checkout_lock_until).getTime() > Date.now()) {
    throw Object.assign(new Error('Checkout is in progress.'), { code: 'SMS_CHECKOUT_IN_PROGRESS', statusCode: 503 });
  }

  try {
    if (command === 'APPROVE' && session.step === 'PREVIEW' && session.artwork) {
      return await store.commitInbound(sql, message, session, { step: 'APPROVED', approved_revision: session.revision, error_code: null }, approvalReply(session, config));
    }
    if (['APPROVED', 'PAYMENT'].includes(session.step)) {
      return await store.commitInbound(sql, message, session, {}, approvalReply(session, config));
    }
    const mediaCount = Number(message.payload.NumMedia || 0);
    const uploadedId = message.payload.uploadedPublicId;
    const changingFit = ['FIT', 'FILL'].includes(command) && session.step === 'PREVIEW';
    if ((mediaCount || uploadedId || changingFit) && ['ARTWORK', 'PREVIEW'].includes(session.step)) {
      if (mediaCount > 1) return await store.commitInbound(sql, message, session, {}, 'Please send one JPG or PNG at a time.');
      let buffer;
      let original;
      const candidate = { ...session, config: { ...session.config, fit_mode: changingFit ? command.toLowerCase() : session.config.fit_mode } };
      if (uploadedId) {
        original = await (dependencies.uploadedOriginal || artwork.uploadedOriginal)(session, uploadedId);
        buffer = await (dependencies.downloadStoredImage || artwork.downloadStoredImage)(original.secure_url);
      } else if (changingFit) {
        buffer = await (dependencies.downloadStoredImage || artwork.downloadStoredImage)(session.artwork.originalUrl);
        original = { secure_url: session.artwork.originalUrl, public_id: session.artwork.originalPublicId,
          asset_id: session.artwork.manifest.assetId, version: session.artwork.manifest.version };
      } else {
        buffer = await (dependencies.downloadTwilioMedia || artwork.downloadTwilioMedia)(message.payload.MediaUrl0, config);
      }
      const rendered = await (dependencies.renderArtwork || artwork.renderArtwork)(candidate, buffer, original);
      const next = { ...candidate, artwork: rendered, revision: session.revision + 1, step: 'PREVIEW', approved_revision: null };
      return await store.commitInbound(sql, message, session, {
        config: next.config, artwork: rendered, revision: next.revision, step: next.step, approved_revision: null, error_code: null,
      }, previewReply(next, config), rendered.previewUrl);
    }
    const next = conversation.nextStep(session, body);
    return await store.commitInbound(sql, message, session, next.changes || {}, next.reply);
  } catch (failure) {
    if (Number(failure.statusCode) >= 400 && Number(failure.statusCode) < 500 && failure.code !== 'SMS_SESSION_CHANGED') {
      const reply = `${failure.message}\nUpload an original or view your order: ${runtime.orderUrl(session, config)}`;
      return store.commitInbound(sql, message, session, { error_code: failure.code }, reply);
    }
    throw failure;
  }
}

async function sendReplies(sql, config, provider = runtime.client(config), max = 25) {
  for (let index = 0; index < max; index += 1) {
    const reply = await store.claimReply(sql, config);
    if (!reply) break;
    if (!runtime.allowedRecipient(reply.phone, config) || await store.optedOut(sql, reply.phone)) {
      await sql`UPDATE bof_sms_outbox SET status = 'suppressed', error_code = 'SMS_RECIPIENT_NOT_ALLOWED', updated_at = NOW() WHERE id = ${reply.id}`;
      continue;
    }
    try {
      const sent = await provider.messages.create({ from: config.phoneNumber, to: reply.phone, body: reply.body,
        ...(reply.media_url ? { mediaUrl: [reply.media_url] } : {}),
        statusCallback: `${config.origin}/api/twilio/status?id=${reply.id}` });
      await sql`UPDATE bof_sms_outbox SET provider_sid = ${sent.sid},
        status = CASE WHEN status = 'sending' THEN 'accepted' ELSE status END, updated_at = NOW()
        WHERE id = ${reply.id} AND (provider_sid IS NULL OR provider_sid = ${sent.sid})`;
    } catch (failure) {
      if (Number(failure.code) === 21610) await store.setOptOut(sql, reply.phone, true);
      // A timeout could have happened after Twilio accepted the text. Only an
      // explicit rate-limit rejection is safe to retry automatically.
      const status = Number(failure.status) === 429 ? 'pending' : Number(failure.status) >= 400 && Number(failure.status) < 500 ? 'failed' : 'unknown';
      await sql`UPDATE bof_sms_outbox SET status = ${status}, error_code = ${String(failure.code || 'SMS_SEND_UNCERTAIN').slice(0, 80)}, updated_at = NOW()
        WHERE id = ${reply.id} AND status = 'sending'`;
      if (status === 'pending') break;
    }
  }
}

async function runWorker(sql, config, dependencies = {}) {
  const deadline = Date.now() + 220000;
  await sql`UPDATE bof_sms_inbound SET status = 'failed', error_code = 'SMS_RETRY_EXHAUSTED', lease_until = NULL
    WHERE status = 'processing' AND attempts >= 5 AND lease_until < NOW()`;
  await sql`UPDATE bof_sms_outbox SET status = 'unknown', error_code = 'SMS_SEND_UNCERTAIN', updated_at = NOW()
    WHERE status = 'sending' AND updated_at < NOW() - INTERVAL '5 minutes'`;
  await sendReplies(sql, config, dependencies.provider);
  for (let index = 0; index < 25 && Date.now() < deadline; index += 1) {
    const message = await store.claimInbound(sql);
    if (!message) break;
    try { await processInbound(sql, message, config, dependencies); }
    catch (failure) {
      await store.retryInbound(sql, message, String(failure.code || 'SMS_PROCESSING_RETRY').slice(0, 80));
      if (message.attempts >= 5) await store.queueReply(sql, { key: `processing-failed:${message.sid}`, phone: message.phone,
        body: 'BOF: We could not finish this step. Please resend your last reply or contact support@bannersonthefly.com.' });
      break;
    }
    await sendReplies(sql, config, dependencies.provider, 3);
  }
}

module.exports = { STOP, START, sessionIdFor, previewReply, approvalReply, processInbound, sendReplies, runWorker };
