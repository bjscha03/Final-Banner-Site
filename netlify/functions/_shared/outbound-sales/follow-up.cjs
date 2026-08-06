'use strict';

const crypto = require('node:crypto');
const { renderOutboundEmailPreview } = require('./personalization-template.cjs');
const { appendAudit } = require('./audit.cjs');

function evidencePhrase(summary) {
  const clean = String(summary || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(?:ignore|follow|reveal|send|print)\s+(?:all\s+)?(?:previous|prior|system|developer|instructions?)\b.*$/i, '')
    .trim();
  return clean.split(/[.!?](?:\s|$)/)[0].split(/\s+/).slice(0, 24).join(' ').replace(/[,:;]+$/, '');
}

function buildDeterministicFollowUp({ businessName, initialSubject, researchSummary }) {
  const phrase = evidencePhrase(researchSummary);
  if (!businessName || phrase.split(/\s+/).length < 5) {
    const error = new Error('Grounded follow-up evidence is unavailable.');
    error.code = 'FOLLOW_UP_NOT_ELIGIBLE';
    throw error;
  }
  const subjectBase = String(initialSubject || 'banner planning').replace(/^(?:re|fw|fwd):\s*/i, '').trim().slice(0, 50);
  const subject = `Re: ${subjectBase}`.slice(0, 60);
  const bodyText = `Hi ${businessName} team,\n\nI wanted to follow up on my note about ${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}.\n\nIf banners, signs, or printed displays would be useful, I can help put together a quick quote around the sizes and quantities you have in mind.\n\nBest,\nBrandon\nBanners On The Fly`;
  return { subject, bodyText, bodyHtml: renderOutboundEmailPreview({ subject, bodyText }), phrase };
}

async function loadFollowUpCandidates(sql, { horizonDays = 14, limit = 30 } = {}) {
  const safeHorizon = Math.max(1, Math.min(30, Number(horizonDays) || 14));
  const safeLimit = Math.max(1, Math.min(30, Number(limit) || 30));
  return sql(
    `SELECT m.id AS initial_message_id,m.prospect_id,m.contact_id,m.campaign_id,
            m.subject AS initial_subject,m.research_summary,m.personalization_evidence,
            m.source_urls,m.research_content_hash,m.content_hash,
            m.recommended_follow_up_at,p.business_name
       FROM outbound_messages m
       JOIN outbound_prospects p ON p.id=m.prospect_id
      WHERE m.message_kind='initial' AND m.generation_status='generated'
        AND m.evidence_validation_status='passed'
        AND m.recommended_follow_up_at IS NOT NULL
        AND m.recommended_follow_up_at<=NOW()+make_interval(days=>$1)
        AND p.status IN ('ready_for_outreach','contacted')
        AND NOT EXISTS (SELECT 1 FROM outbound_replies r WHERE r.prospect_id=m.prospect_id)
        AND NOT EXISTS (
          SELECT 1 FROM outbound_messages f
           WHERE f.prospect_id=m.prospect_id AND f.message_kind='follow_up'
             AND f.generation_key='follow-up:'||m.content_hash
        )
        AND NOT EXISTS (
          SELECT 1 FROM outbound_suppressions s
           WHERE s.active=TRUE AND (s.expires_at IS NULL OR s.expires_at>NOW())
             AND s.prospect_id=m.prospect_id
        )
      ORDER BY m.recommended_follow_up_at,m.created_at
      LIMIT $2`,
    [safeHorizon, safeLimit],
  );
}

async function saveFollowUpPreview(sql, candidate, copy) {
  const generationKey = `follow-up:${candidate.content_hash}`;
  const contentHash = crypto.createHash('sha256').update(`${copy.subject}\n${copy.bodyText}`).digest('hex');
  const rows = await sql(
    `INSERT INTO outbound_messages (
       prospect_id,contact_id,campaign_id,message_kind,status,subject,body_text,
       body_html,research_summary,personalization_evidence,source_urls,
       variant_assignments,recommended_follow_up_at,generation_status,generation_key,
       prompt_version,output_schema_version,research_content_hash,model,
       actual_openai_cost_microusd,content_hash,evidence_validation_status,
       generation_metadata,generated_at,delivery_state,planned_send_at
     ) VALUES (
       $1,$2,$3,'follow_up','draft',$4,$5,$6,$7,$8::jsonb,$9::jsonb,
       '{"followUpStyle":"deterministic_evidence_reminder","experimentState":"shadow_observation_only"}'::jsonb,
       NULL,'generated',$10,'deterministic-follow-up-v1','shadow-follow-up-v1',$11,
       'deterministic',0,$12,'passed',$13::jsonb,NOW(),'shadow_planned',$14
     ) ON CONFLICT (generation_key) DO NOTHING
     RETURNING id,prospect_id,delivery_state,planned_send_at`,
    [
      candidate.prospect_id,candidate.contact_id,candidate.campaign_id,copy.subject,
      copy.bodyText,copy.bodyHtml,candidate.research_summary,
      JSON.stringify(candidate.personalization_evidence || []),JSON.stringify(candidate.source_urls || []),
      generationKey,candidate.research_content_hash,contentHash,
      JSON.stringify({ shadowMode:true,automatic:false,initialMessageId:candidate.initial_message_id,evidencePhrase:copy.phrase }),
      candidate.recommended_follow_up_at,
    ],
  );
  return rows[0] || null;
}

async function planShadowFollowUps(options) {
  if (!options.controls?.shadowModeEnabled || options.controls?.liveSendingEnabled || options.controls?.emergencyPaused) {
    const error = new Error('Shadow follow-up planning is blocked.'); error.code = 'OUTBOUND_SEND_BLOCKED'; throw error;
  }
  const dependencies = { loadFollowUpCandidates, saveFollowUpPreview, appendAudit, ...options.dependencies };
  const candidates = await dependencies.loadFollowUpCandidates(options.sql, { horizonDays:14, limit:Math.min(30, Number(options.controls.dailySendLimit) || 30) });
  const planned=[];
  for (const candidate of candidates) {
    try {
      const copy=buildDeterministicFollowUp({businessName:candidate.business_name,initialSubject:candidate.initial_subject,researchSummary:candidate.research_summary});
      const saved=await dependencies.saveFollowUpPreview(options.sql,candidate,copy);
      if(saved)planned.push(saved);
    } catch { /* An ineligible evidence summary safely produces no draft. */ }
  }
  if(planned.length)await dependencies.appendAudit(options.sql,{action:'follow_up.shadow_previews_planned',entityType:'follow_up_batch',entityId:new Date().toISOString().slice(0,10),newValues:{plannedCount:planned.length},metadata:{shadowMode:true,externalEmailsSent:0,automaticSending:false},requestId:options.requestId||null});
  return{shadowMode:true,planned,count:planned.length,externalEmailsSent:0};
}

module.exports={evidencePhrase,buildDeterministicFollowUp,loadFollowUpCandidates,saveFollowUpPreview,planShadowFollowUps};
