#!/usr/bin/env node

/**
 * Test PayPal Authentication
 * Tests if PayPal credentials can authenticate with PayPal API
 */

import { config } from 'dotenv';

// Load environment variables
config();

const testPayPalAuth = async () => {
  console.log('🧪 Testing PayPal Authentication');
  console.log('================================');
  
  // Get credentials
  const env = process.env.PAYPAL_ENV || 'sandbox';
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];
  
  console.log(`Environment: ${env}`);
  console.log(`Client ID: ${clientId ? clientId.substring(0, 10) + '...' : 'NOT SET'}`);
  console.log(`Secret: ${secret ? secret.substring(0, 5) + '...' : 'NOT SET'}`);
  console.log('');
  
  if (!clientId || !secret) {
    console.log('❌ PayPal credentials not configured');
    return;
  }
  
  // Test authentication
  const baseUrl = env === 'live'
    ? 'https://api.paypal.com'
    : 'https://api.sandbox.paypal.com';

  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');

  console.log(`Base URL: ${baseUrl}`);
  console.log(`Auth string length: ${auth.length}`);
  console.log(`Full Client ID: ${clientId}`);
  console.log(`Full Secret: ${secret}`);
  console.log('');

  try {
    console.log('🔐 Testing PayPal API authentication...');

    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    console.log(`Response status: ${response.status}`);
    console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const error = await response.text();
      console.log(`❌ PayPal authentication failed: ${response.status}`);
      console.log(`Error: ${error}`);

      // Try to decode the auth string to verify it's correct
      const decoded = Buffer.from(auth, 'base64').toString();
      console.log(`Decoded auth (first 50 chars): ${decoded.substring(0, 50)}...`);
      return;
    }

    const data = await response.json();
    console.log('✅ PayPal authentication successful!');
    console.log(`Access token: ${data.access_token.substring(0, 20)}...`);
    console.log(`Token type: ${data.token_type}`);
    console.log(`Expires in: ${data.expires_in} seconds`);

  } catch (error) {
    console.log('❌ PayPal authentication error:', error.message);
  }
};

testPayPalAuth().catch(console.error);
