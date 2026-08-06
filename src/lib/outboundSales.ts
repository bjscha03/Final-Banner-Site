import { adminFetch } from '@/lib/serverAuth';

export interface OutboundSettings {
  shadowModeEnabled: boolean;
  liveSendingEnabled: boolean;
  emergencyPaused: boolean;
  dailySendLimit: number;
  monthlyOpenAIBudgetCents: number;
  openAIProjectLimitRecommendationCents: number;
  monthlyProviderBudgetCents: number;
  businessTimezone: string;
  settingsVersion: number;
  updatedAt?: string | null;
}

export interface OutboundControls {
  mode: 'disabled' | 'shadow' | 'live' | 'emergency_paused';
  outboundSalesEnabled: boolean;
  shadowModeEnabled: boolean;
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
    emailVerification: boolean;
    apolloDiscovery: boolean;
  };
  providers: OutboundProviderStatus[];
  metrics: {
    prospectsTotal: number;
    readyForOutreach: number;
    messagesTotal: number;
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
    emailSendingInstalled: boolean;
    scheduledAutomationInstalled: boolean;
    liveSendingPhaseLocked: boolean;
  };
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
  primaryContact: OutboundQueueContact | null;
  discoveredAt: string;
  lastResearchedAt: string | null;
  lastQualifiedAt: string | null;
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
    'dailySendLimit' | 'monthlyOpenAIBudgetCents'>>,
): Promise<{ ok: true; settings: OutboundSettings; controls: OutboundControls }> {
  const response = await adminFetch('/.netlify/functions/outbound-sales-settings', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ settingsVersion, ...changes }),
  });
  return parseResponse(response);
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

export function microusdToDollars(value: number): number {
  return (Number(value) || 0) / 1_000_000;
}
