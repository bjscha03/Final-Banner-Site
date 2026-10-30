import { reconcileThread } from './mail-sync.mjs';
import { gmailRequest } from './gmail.mjs';

// Returns a verified recipient for a reply. The model cannot choose an address.
export async function checkDispatchConversation(sql, message, contact, token, {preview=false,gmailTest=false,request=gmailRequest}={}) {
  const [settings] = await sql`SELECT paused FROM daniel_sales.settings WHERE id=1`;
  if (!settings || (settings.paused && !gmailTest)) return {ok:false,reason:'agent_paused',retryable:true};
  if (message.kind === 'intro') {
    const answered = await sql`SELECT id FROM daniel_sales.contacts WHERE account_id=${contact.account_id} AND replied_at IS NOT NULL LIMIT 1`;
    if (answered.length) return {ok:false,reason:'account_already_replied'};
    return {ok:true,recipient:contact.email};
  }
  if (!message.thread_key || !message.reply_to_id) return {ok:false,reason:'missing_verified_thread'};
  let latest;
  if (!preview) {
    // Provider/network failures are not evidence of no reply. Leave held, never
    // reserve quota and never dispatch from an unverifiable conversation.
    let refreshed;
    try { refreshed=await reconcileThread(sql,token,message.thread_key,request); }
    catch { return {ok:false,reason:'gmail_thread_check_failed',retryable:true}; }
    if (refreshed.held) return {ok:false,reason:'conversation_identity_review'};
    latest=refreshed.latestHuman;
  } else {
    [latest] = await sql`SELECT * FROM daniel_sales.messages WHERE thread_key=${message.thread_key} AND direction='inbound' AND classification IS DISTINCT FROM 'automated' ORDER BY created_at DESC,id DESC LIMIT 1`;
  }
  if (message.kind === 'followup') {
    if (latest) return {ok:false,reason:'human_reply_received'};
    const answered = await sql`SELECT id FROM daniel_sales.contacts WHERE account_id=${contact.account_id} AND replied_at IS NOT NULL LIMIT 1`;
    if (answered.length) return {ok:false,reason:'account_already_replied'};
    return {ok:true,recipient:contact.email};
  }
  if (message.kind !== 'reply') return {ok:false,reason:'invalid_message_kind'};
  if (!latest || latest.rfc_message_id !== message.reply_to_id) return {ok:false,reason:'outdated_reply_context'};
  if (latest.ai_metadata?.requires_identity_review) return {ok:false,reason:'conversation_identity_review'};
  const recipient=latest.ai_metadata?.reply_recipient || contact.email;
  if ((message.ai_metadata?.reply_recipient || contact.email).toLowerCase() !== recipient.toLowerCase()) return {ok:false,reason:'reply_recipient_changed'};
  const alreadyAnswered=await sql`SELECT id FROM daniel_sales.messages WHERE direction='outbound' AND kind='reply' AND reply_to_id=${message.reply_to_id} AND status IN ('sent','sending','uncertain','simulated') AND id<>${message.id} LIMIT 1`;
  if (alreadyAnswered.length) return {ok:false,reason:'reply_already_answered'};
  const suppression=await sql`SELECT email FROM daniel_sales.suppressions WHERE email=lower(${recipient}) LIMIT 1`;
  if (suppression.length) return {ok:false,reason:'suppressed'};
  return {ok:true,recipient};
}
