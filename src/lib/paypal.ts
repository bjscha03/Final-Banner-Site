/**
 * PayPal Integration Utilities
 * 
 * This module provides server-side PayPal API integration utilities.
 * All PayPal secrets are kept server-side only.
 */

export interface PayPalCredentials {
  clientId: string;
  secret: string;
  baseUrl: string;
}

export interface PayPalOrderRequest {
  intent: 'CAPTURE';
  purchase_units: Array<{
    amount: {
      currency_code: 'USD';
      value: string;
    };
    description?: string;
    shipping?: {
      name?: {
        full_name: string;
      };
      address?: {
        address_line_1: string;
        address_line_2?: string;
        admin_area_2: string; // city
        admin_area_1: string; // state
        postal_code: string;
        country_code: string;
      };
    };
  }>;
  application_context?: {
    brand_name?: string;
    user_action?: 'PAY_NOW' | 'CONTINUE';
    return_url?: string;
    cancel_url?: string;
  };
}

export interface PayPalOrderResponse {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

export interface PayPalCaptureResponse {
  id: string;
  status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED';
  purchase_units: Array<{
    payments: {
      captures: Array<{
        id: string;
        status: string;
        amount: {
          currency_code: string;
          value: string;
        };
      }>;
    };
  }>;
  payer: {
    email_address: string;
    name: {
      given_name: string;
      surname: string;
    };
  };
}

/**
 * Get PayPal credentials based on environment
 * Server-side only - never expose secrets to client
 */
export function getPayPalCredentials(): PayPalCredentials {
  const env = process.env.PAYPAL_ENV || 'sandbox';
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];
  
  if (!clientId || !secret) {
    throw new Error(`PayPal credentials not configured for environment: ${env}`);
  }
  
  return {
    clientId,
    secret,
    baseUrl: env === 'live' 
      ? 'https://api.paypal.com' 
      : 'https://api.sandbox.paypal.com'
  };
}

/**
 * Get PayPal access token for API calls
 * Server-side only
 */
export async function getPayPalAccessToken(): Promise<string> {
  const { clientId, secret, baseUrl } = getPayPalCredentials();
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PayPal auth failed: ${response.status} ${error}`);
  }
  
  const data = await response.json();
  return data.access_token;
}

/**
 * Make authenticated PayPal API calls
 * Server-side only
 */
export async function paypalFetch(
  path: string, 
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' = 'GET', 
  body: any = null
): Promise<Response> {
  const { baseUrl } = getPayPalCredentials();
  const accessToken = await getPayPalAccessToken();
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  
  const config: RequestInit = {
    method,
    headers
  };
  
  if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    config.body = JSON.stringify(body);
  }
  
  const response = await fetch(`${baseUrl}${path}`, config);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal API error: ${response.status} ${errorText}`);
  }
  
  return response;
}

/**
 * Feature flag helpers
 */
export function isPayPalEnabled(): boolean {
  return process.env.FEATURE_PAYPAL === '1';
}

export function isUserAdmin(email: string): boolean {
  const allowlist = process.env.ADMIN_TEST_PAY_ALLOWLIST?.split(',') || [];
  return allowlist.includes(email);
}

/**
 * Client-side helper to get public PayPal client ID
 * This will be called from a Netlify function to avoid exposing env vars at build time
 */
export interface PayPalConfig {
  clientId: string;
  environment: 'sandbox' | 'live';
  enabled: boolean;
}
