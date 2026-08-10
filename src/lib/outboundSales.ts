import { adminFetch } from '@/lib/serverAuth';

export interface OutboundSettings {
  shadowModeEnabled: boolean;
  shadowGenerationEnabled: boolean;
  liveSendingEnabled: boolean;
  emergencyPaused: boolean;
  dailySendLimit: number;
  monthlyOpenAIBudgetCents: number;
  openAIProjectLimitRecommendationCents: number;
  monthlyProviderBudgetCents: number;
  replyIngestionEnabled: boolean;
  replyAIFallbackEnabled: boolean;
  suggestedReplyGenerationEnabled: boolean;
  automationEnabled: boolean;
  deliveryWebhookEnabled: boolean;
  attributionEnabled: boolean;
  learningEnabled: boolean;
  monitoringEnabled: boolean;
  minimumLearningSample: number;
  explorationPercent: number;
  sendingWindowStartLocal: string;
  sendingWindowEndLocal: string;
  minimumSpacingSeconds: number;
  maximumBounceRate: number;
  maximumComplaintRate: number;
  maximumErrorRate: number;
  businessTimezone: string;
  settingsVersion: number;
  updatedAt?: string | null;
}

export interface OutboundControls {
  mode: 'disabled' | 'shadow' | 'live' | 'emergency_paused';
  outboundSalesEnabled: boolean;
  shadowModeEnabled: boolean;
  shadowGenerationRequested: boolean;
  shadowGenerationAvailable: boolean;
  shadowGenerationEnabled: boolean;
  automationRequested: boolean;
  automationAvailable: boolean;
  automationEnabled: boolean;
  replyIngestionRequested: boolean;
  replyIngestionAvailable: boolean;
  replyIngestionEnabled: boolean;
  replyAIFallbackRequested: boolean;
  replyAIFallbackAvailable: boolean;
  replyAIFallbackEnabled: boolean;
  automaticRepliesEnabled: false;
  liveSendingRequested: boolean;
  liveSendingAvailable: boolean;
  liveSendingEnabled: boolean;
  emergencyPaused: boolean;
  dailySendLimit: number;
  monthlyOpenAIBudgetCents: number;
  openAIProjectLimitRecommendationCents: number;
}

export interface OutboundProviderStatus {
  id: string;
  displayName: string;
  kind: 'discovery' | 'email_verification';
  acquisitionMode: 'licensed_api' | 'first_party';
  configured: boolean;
  adapterInstalled: boolean;
  executionScope: 'test_staging_only' | 'not_installed';
  executionAllowed: boolean;
  enabled: boolean;
  dailyRequestLimit: number;
  monthlyBudgetCents: number;
}

export interface OutboundStatus {
  ok: boolean;
  authorized: boolean;
  phase: string;
  schemaReady: boolean;
  databaseConfigured: boolean;
  databaseAvailable: boolean;
  controls: OutboundControls;
  settings: OutboundSettings;
  secretStatus: {
    openAI: boolean;
    resend: boolean;
    resendWebhook: boolean;
    unsubscribeSigning: boolean;
    automation: boolean;
    deliveryIdentity: boolean;
    emailVerification: boolean;
    apolloDiscovery: boolean;
  };
  providers: OutboundProviderStatus[];
  metrics: {
    prospectsTotal: number;
    readyForOutreach: number;
    messagesTotal: number;
    messagesGenerated: number;
    messagesSent: number;
    repliesTotal: number;
    attributedOrders: number;
    revenueGeneratedCents: number;
    activeJobs: number;
    deadJobs: number;
  };
  monthlyCostsMicrousd: {
    openAI: number;
    discovery: number;
    emailVerification: number;
    resend: number;
  };
  safeguards: {
    providerExecutionInstalled: boolean;
    providerExecutionProductionBlocked: boolean;
    openAICallsInstalled: boolean;
    openAIExecutionScope: 'test_staging_only';
    openAIExecutionProductionBlocked: boolean;
    emailSendingInstalled: boolean;
    emailSendingProductionBlocked: boolean;
    emailSendingPolicyBlocked: boolean;
    scheduledAutomationInstalled: boolean;
    shadowAutomationInstalled: boolean;
    shadowAutomationProductionBlocked: boolean;
    inboundProcessingInstalled: boolean;
    inboundProcessingProductionBlocked: boolean;
    replyAIFallbackInstalled: boolean;
    replyAIFallbackProductionBlocked: boolean;
    automaticRepliesInstalled: boolean;
    liveSendingPhaseLocked: boolean;
  };
}

export interface OutboundMessagePreview {
  id: string;
  messageKind?: 'initial' | 'follow_up' | 'suggested_reply';
  campaignId?: string | null;
  generationStatus: 'not_generated' | 'generating' | 'generated' | 'blocked' | 'failed' | 'stale';
  promptVersion: string | null;
  outputSchemaVersion: string | null;
  researchContentHash: string | null;
  model: string | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml?: string | null;
  researchSummary: string | null;
  personalizationEvidence: Array<{ id?: string; code?: string; label?: string; evidence?: string; sourceUrl?: string | null }>;
  sourceUrls: string[];
  variantAssignments: Record<string, string>;
  recommendedFollowUpAt: string | null;
  estimatedOpenAICostMicrousd: number;
  actualOpenAICostMicrousd: number | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  evidenceValidationStatus: string | null;
  generationErrorCode: string | null;
  generationMetadata?: Record<string, unknown>;
  contentHash?: string | null;
  generatedAt: string | null;
  deliveryState?: 'not_planned' | 'shadow_planned' | 'ready' | 'sending' | 'sent' | 'blocked' | 'failed' | 'canceled';
  plannedSendAt?: string | null;
  sendAttemptCount?: number;
  resendMessageId?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface OutboundQueueContact {
  email: string;
  sourceUrl: string | null;
  syntaxValid: boolean;
  verificationStatus: string;
  verificationReason: string;
  mxStatus: string;
  isRoleAddress: boolean;
  isFreeMailbox: boolean;
  domainMatches: boolean;
  contactQualityScore: number;
  sendEligible: false;
}

export interface OutboundQueueProspect {
  id: string;
  businessName: string;
  websiteUrl: string | null;
  canonicalDomain: string | null;
  industry: string | null;
  businessType: string | null;
  locationCount: number | null;
  status: string;
  leadScore: number | null;
  scoreBreakdown: Record<string, number>;
  scoreExplanation: Array<{ factor: string; points: number; label: string; detail: string; sourceUrls?: string[] }>;
  qualificationEvidence: Array<{ code: string; sourceUrl?: string; evidence?: string }>;
  rejectionReason: string | null;
  suppressionReason: string | null;
  exclusionCodes: string[];
  priorCustomerMatch: boolean;
  researchState: string;
  contactState: string;
  sourceProviderId: string;
  sourceUrls: string[];
  researchFacts: Record<string, unknown>;
  researchCacheStatus: string | null;
  websiteFreshnessScore: number | null;
  personalizationState: string;
  personalizationFailureCode: string | null;
  lastPersonalizedAt: string | null;
  messagePreview: OutboundMessagePreview | null;
  primaryContact: OutboundQueueContact | null;
  discoveredAt: string;
  lastResearchedAt: string | null;
  lastQualifiedAt: string | null;
}

export interface OutboundPersonalizationActivityMessage extends OutboundMessagePreview {
  prospectId: string;
  businessName: string;
  industry: string | null;
  leadScore: number | null;
  prospectStatus: string;
}

export interface OutboundPersonalizationActivity {
  ok: true;
  schemaReady: boolean;
  shadowMode: true;
  liveSending: false;
  messages: OutboundPersonalizationActivityMessage[];
  total: number;
  limit: number;
  offset: number;
  summary: {
    generated: number;
    failed: number;
    blocked: number;
    actualCostMicrousd: number;
    averageCostMicrousd: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  };
}

export interface OutboundProspectQueue {
  ok: true;
  schemaReady: boolean;
  shadowMode: true;
  liveSending: false;
  prospects: OutboundQueueProspect[];
  total: number;
  limit: number;
  offset: number;
  statusCounts: Record<string, number>;
  providerUsage: Array<{
    providerId: string;
    operation: string;
    requests: number;
    results: number;
    credits: number;
    costMicrousd: number;
  }>;
}

export interface OutboundManualReviewLead {
  prospectId: string;
  businessName: string;
  websiteUrl: string | null;
  canonicalDomain: string | null;
  industry: string | null;
  businessType: string | null;
  phone: string | null;
  leadScore: number | null;
  prospectStatus: string;
  sourceProviderId: string;
  sourceUrl: string | null;
  scoreExplanation: Array<{ factor?: string; points?: number; label?: string; detail?: string }>;
  qualificationEvidence: Array<{ code?: string; evidence?: string; sourceUrl?: string }>;
  eventFit: {
    priority: 'trade_show' | 'event_signal' | 'general_high_value';
    label: string;
    evidence: Array<{ code?: string; label?: string; detail?: string; evidence?: string; sourceUrl?: string; sourceUrls?: string[] }>;
  };
  contact: null | {
    id: string;
    email: string;
    fullName: string | null;
    jobTitle: string | null;
    sourceUrl: string | null;
    verificationStatus: string;
    verificationReason: string | null;
    syntaxValid: boolean;
    mxStatus: string;
    isRoleAddress: boolean;
    isFreeMailbox: boolean;
    domainMatches: boolean;
    contactQualityScore: number;
  };
  message: null | {
    id: string;
    subject: string | null;
    bodyText: string | null;
    bodyHtml: string | null;
    generationStatus: string;
    evidenceValidationStatus: string;
    sentAt: string | null;
  };
  review: {
    status: 'pending' | 'approved' | 'rejected';
    permissionStatus: 'unknown' | 'explicit_opt_in' | 'admin_authorized';
    permissionEvidence: string;
    notes: string;
    reviewedBy: string | null;
    reviewedAt: string | null;
    sendState: 'not_sent' | 'processing' | 'sent' | 'failed';
    sendAttemptCount: number;
    resendMessageId: string | null;
    lastSendErrorCode: string | null;
    sentAt: string | null;
  };
  technicalBlockers: string[];
  canSend: boolean;
  discoveredAt: string;
  lastQualifiedAt: string | null;
}

export interface OutboundManualReviewQueue {
  ok: true;
  schemaReady: boolean;
  deliveryReady: boolean;
  deliveryIssues: string[];
  leads: OutboundManualReviewLead[];
  total: number;
  limit: number;
  offset: number;
  minimumScore: number;
  reviewView: 'ready' | 'pending' | 'approved' | 'rejected' | 'sent' | 'all';
  counts: { pending: number; approved: number; rejected: number; sent: number };
  today: { attempted: number; sent: number; limit: number };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || body?.error || 'The AI Sales Engine request failed.');
  }
  return body as T;
}

export async function getOutboundStatus(signal?: AbortSignal): Promise<OutboundStatus> {
  const response = await adminFetch('/.netlify/functions/outbound-sales-status', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  });
  return parseResponse<OutboundStatus>(response);
}

export async function updateOutboundSettings(
  settingsVersion: number,
  changes: Partial<Pick<OutboundSettings,
    'shadowModeEnabled' | 'liveSendingEnabled' | 'emergencyPaused' |
    'shadowGenerationEnabled' | 'dailySendLimit' | 'monthlyOpenAIBudgetCents' |
    'replyIngestionEnabled' | 'replyAIFallbackEnabled' | 'suggestedReplyGenerationEnabled' |
    'automationEnabled' | 'deliveryWebhookEnabled' | 'attributionEnabled' |
    'learningEnabled' | 'monitoringEnabled' | 'minimumLearningSample' | 'explorationPercent'>>,
): Promise<{ ok: true; settings: OutboundSettings; controls: OutboundControls }> {
  const response = await adminFetch('/.netlify/functions/outbound-sales-settings', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ settingsVersion, ...changes }),
  });
  return parseResponse(response);
}

export async function generateOutboundPersonalization(
  prospectId: string,
): Promise<{ ok: true; shadowMode: true; liveSending: false; skipped: boolean; cacheHit: boolean; prospectId: string; message: OutboundMessagePreview }> {
  const response = await adminFetch('/.netlify/functions/outbound-sales-personalize', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ prospectId }),
  });
  return parseResponse(response);
}

export async function getOutboundPersonalizationActivity(
  options: { limit?: number; offset?: number; signal?: AbortSignal } = {},
): Promise<OutboundPersonalizationActivity> {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  const response = await adminFetch(`/.netlify/functions/outbound-sales-activity?${params}`, {
    method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: options.signal,
  });
  return parseResponse(response);
}

export async function downloadOutboundMessagesCsv(): Promise<void> {
  const response = await adminFetch('/.netlify/functions/outbound-sales-activity?format=csv', {
    method: 'GET', credentials: 'same-origin', headers: { Accept: 'text/csv' },
  });
  if (!response.ok) await parseResponse(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'outbound-shadow-messages.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function getOutboundProspects(
  options: { status?: string; limit?: number; offset?: number; signal?: AbortSignal } = {},
): Promise<OutboundProspectQueue> {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  const response = await adminFetch(`/.netlify/functions/outbound-sales-prospects?${params}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  });
  return parseResponse<OutboundProspectQueue>(response);
}

export async function downloadOutboundProspectsCsv(status?: string): Promise<void> {
  const params = new URLSearchParams({ format: 'csv' });
  if (status) params.set('status', status);
  const response = await adminFetch(`/.netlify/functions/outbound-sales-prospects?${params}`, {
    method: 'GET', credentials: 'same-origin', headers: { Accept: 'text/csv' },
  });
  if (!response.ok) await parseResponse(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'outbound-shadow-prospects.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function getOutboundManualReviewLeads(
  options: { limit?: number; offset?: number; minimumScore?: number; view?: 'ready' | 'sent' | 'all'; signal?: AbortSignal } = {},
): Promise<OutboundManualReviewQueue> {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  if (options.minimumScore) params.set('minimumScore', String(options.minimumScore));
  if (options.view) params.set('view', options.view);
  const response = await adminFetch(`/.netlify/functions/outbound-sales-manual-review?${params}`, {
    method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: options.signal,
  });
  return parseResponse<OutboundManualReviewQueue>(response);
}

export async function sendOutboundReviewedLead(prospectId: string): Promise<{ ok: true; duplicate: boolean; messageId: string }> {
  const response = await adminFetch('/.netlify/functions/outbound-sales-manual-review', {
    method: 'POST', credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ prospectId }),
  });
  return parseResponse(response);
}

export function microusdToDollars(value: number): number {
  return (Number(value) || 0) / 1_000_000;
}

export interface OutboundReply {
  id: string; prospectId: string; messageId: string | null; businessName: string;
  fromEmail: string; toEmail: string | null; subject: string | null; bodyText: string | null;
  classification: string; classificationSource: string; classificationConfidence: number;
  classificationReason: string[]; suggestedResponseSubject: string | null;
  suggestedResponseBody: string | null; suggestedResponseStatus: string;
  suggestedResponseReviewRequired: true; reviewStatus: string;
  receivedAt: string; handledAt: string | null;
}

export interface OutboundRepliesResponse {
  ok: true; schemaReady: boolean; shadowMode: true; liveSending: false;
  automaticReplies: false; ingestionEnabled?: boolean; replies: OutboundReply[];
  total: number; classificationCounts: Record<string, number>; limit: number; offset: number;
}

export interface OutboundAnalyticsResponse<T = unknown> {
  ok: true; schemaReady: boolean; shadowMode: true; liveSending: false; view: string; data: T;
}

export async function getOutboundReplies(options: { classification?: string; limit?: number; offset?: number; signal?: AbortSignal } = {}): Promise<OutboundRepliesResponse> {
  const params = new URLSearchParams();
  if (options.classification) params.set('classification', options.classification);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  const response = await adminFetch(`/.netlify/functions/outbound-sales-replies?${params}`, { method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: options.signal });
  return parseResponse(response);
}

export async function updateOutboundReply(replyId: string, reviewStatus: string, classification?: string): Promise<void> {
  const response = await adminFetch('/.netlify/functions/outbound-sales-replies', { method: 'PUT', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ replyId, reviewStatus, ...(classification ? { classification } : {}) }) });
  await parseResponse(response);
}

async function downloadOutboundCsv(endpoint: string, filename: string): Promise<void> {
  const response = await adminFetch(endpoint, { method: 'GET', credentials: 'same-origin', headers: { Accept: 'text/csv' } });
  if (!response.ok) await parseResponse(response);
  const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

export function downloadOutboundRepliesCsv(): Promise<void> { return downloadOutboundCsv('/.netlify/functions/outbound-sales-replies?format=csv', 'outbound-replies.csv'); }
export function downloadOutboundOrdersCsv(): Promise<void> { return downloadOutboundCsv('/.netlify/functions/outbound-sales-analytics?view=orders&format=csv', 'outbound-attributed-orders.csv'); }

export async function getOutboundAnalytics<T>(view: 'campaigns' | 'performance' | 'orders' | 'errors' | 'costs' | 'learning', options: { days?: number; limit?: number; offset?: number; signal?: AbortSignal } = {}): Promise<OutboundAnalyticsResponse<T>> {
  const params = new URLSearchParams({ view });
  if (options.days) params.set('days', String(options.days));
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  const response = await adminFetch(`/.netlify/functions/outbound-sales-analytics?${params}`, { method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: options.signal });
  return parseResponse(response);
}
