/**
 * API Configuration Helper for Netlify Functions
 * 
 * Provides consistent URL generation for Netlify Functions across the application.
 * This ensures all API calls use the correct /.netlify/functions/ prefix.
 */

/**
 * Generate a Netlify Function URL
 * @param name - The function name (without .ts/.js extension)
 * @returns The complete URL path to the Netlify Function
 * 
 * @example
 * fn('request-password-reset') // Returns: '/.netlify/functions/request-password-reset'
 * fn('notify-order') // Returns: '/.netlify/functions/notify-order'
 */
export const fn = (name: string): string => `/.netlify/functions/${name}`;

/**
 * Common API response types for consistent error handling
 */
export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  details?: any;
}

/**
 * Email-specific API response types
 */
export interface EmailResponse extends ApiResponse {
  id?: string;
  idempotent?: boolean;
}

/**
 * Helper function for making API calls to Netlify Functions
 * @param functionName - The Netlify Function name
 * @param options - Fetch options (method, body, headers, etc.)
 * @returns Promise with parsed JSON response
 */
export async function callFunction<T = any>(
  functionName: string, 
  options: RequestInit = {}
): Promise<T> {
  const url = fn(functionName);
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Specific helper functions for common email operations
 */
export const emailApi = {
  /**
   * Request a password reset email
   */
  requestPasswordReset: (email: string): Promise<ApiResponse> =>
    callFunction('request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  /**
   * Confirm password reset with token
   */
  confirmPasswordReset: (token: string, newPassword: string): Promise<ApiResponse> =>
    callFunction('confirm-password-reset', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    }),

  /**
   * Send order confirmation email (idempotent)
   */
  notifyOrder: (orderId: string): Promise<EmailResponse> =>
    callFunction('notify-order', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    }),

  /**
   * Admin function to resend order confirmation
   */
  adminResendConfirmation: (orderId: string): Promise<EmailResponse> =>
    callFunction('admin-resend-confirmation', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    }),
};
