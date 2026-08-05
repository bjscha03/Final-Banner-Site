import { gtag } from '@/lib/analytics';

export type AIAnalyticsEvent =
  | 'ai_designer_opened'
  | 'ai_brief_created'
  | 'ai_generation_started'
  | 'ai_generation_succeeded'
  | 'ai_generation_failed'
  | 'ai_validation_failed'
  | 'ai_concept_selected'
  | 'ai_edit_started'
  | 'ai_edit_succeeded'
  | 'ai_edit_rejected'
  | 'ai_design_approved'
  | 'ai_applied_to_configurator'
  | 'ai_added_to_cart'
  | 'ai_checkout_started';

export function trackAIEvent(event: AIAnalyticsEvent, safeProperties: Record<string, string | number | boolean | null> = {}) {
  gtag('event', event, safeProperties);
}
