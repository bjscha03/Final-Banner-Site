import { gtag } from '@/lib/analytics';
import { sendClarity } from '@/lib/trackingRuntime';
import { authenticatedJsonBody, authorizedHeaders, getServerSessionToken } from '@/lib/serverAuth';

export type AIAnalyticsEvent =
  | 'ai_designer_opened'
  | 'ai_prompt_entered'
  | 'ai_brief_created'
  | 'ai_generation_started'
  | 'ai_generation_succeeded'
  | 'ai_generation_failed'
  | 'ai_validation_failed'
  | 'ai_concept_selected'
  | 'ai_edit_started'
  | 'ai_edit_succeeded'
  | 'ai_edit_failed'
  | 'ai_transfer_failed'
  | 'ai_edit_rejected'
  | 'ai_design_approved'
  | 'ai_applied_to_configurator'
  | 'ai_added_to_cart'
  | 'ai_checkout_started'
  | 'ai_purchase_completed';

export function trackAIEvent(event: AIAnalyticsEvent, safeProperties: Record<string, string | number | boolean | null> = {}) {
  // Keep replay milestones visible without sending prompts or customer art.
  // Tracking failures must never interrupt a completed edit or artwork transfer.
  try {
    gtag('event', event, safeProperties);
    sendClarity('event', event);
    for (const key of ['version_number', 'edit_round', 'category']) {
      const value = safeProperties[key];
      if (value != null) sendClarity('set', `ai_designer.${key}`, String(value));
    }
  } catch { /* Analytics is best effort. */ }
  // Admin testing remains outside customer advertising conversions. Record
  // internal feature events through the same signed session as the designer.
  if (typeof window !== 'undefined' && getServerSessionToken()) {
    void fetch('/.netlify/functions/ai-designer-events', {
      method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
      body: authenticatedJsonBody({ event, properties: safeProperties }),
    }).catch(() => {});
  }
}
