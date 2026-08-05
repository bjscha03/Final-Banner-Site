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
    openAICallsInstalled: boolean;
    emailSendingInstalled: boolean;
    scheduledAutomationInstalled: boolean;
    liveSendingPhaseLocked: boolean;
  };
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

export function microusdToDollars(value: number): number {
  return (Number(value) || 0) / 1_000_000;
}
