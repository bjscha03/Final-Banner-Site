#!/usr/bin/env node

/**
 * Test script for PayPal configuration endpoint
 * 
 * This script tests the PayPal configuration endpoint to ensure it returns
 * the correct configuration based on environment variables.
 */

const https = require('https');
const http = require('http');

// Configuration
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8888';
const ENDPOINT = '/.netlify/functions/paypal-config';

// Environment variable checks
function checkEnvironmentVariables() {
  console.log('🔍 Environment Variable Check');
  console.log('============================');

  const requiredVars = [
    'FEATURE_PAYPAL',
    'PAYPAL_ENV',
    'PAYPAL_CLIENT_ID_SANDBOX',
    'PAYPAL_SECRET_SANDBOX',
    'NETLIFY_DATABASE_URL'
  ];

  const optionalVars = [
    'PAYPAL_CLIENT_ID_LIVE',
    'PAYPAL_SECRET_LIVE',
    'ADMIN_TEST_PAY_ALLOWLIST',
    'PUBLIC_SITE_URL'
  ];

  console.log('Required Variables:');
  requiredVars.forEach(varName => {
    const value = process.env[varName];
    const status = value ? '✅' : '❌';
    const display = value ? (varName.includes('SECRET') ? '[HIDDEN]' : value) : 'NOT SET';
    console.log(`  ${status} ${varName}: ${display}`);
  });

  console.log('\nOptional Variables:');
  optionalVars.forEach(varName => {
    const value = process.env[varName];
    const status = value ? '✅' : '⚠️ ';
    const display = value ? (varName.includes('SECRET') ? '[HIDDEN]' : value) : 'NOT SET';
    console.log(`  ${status} ${varName}: ${display}`);
  });

  console.log('');
}

async function testPayPalConfig() {
  console.log('🧪 Testing PayPal Configuration Endpoint');
  console.log('=====================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log('');

  // First check environment variables
  checkEnvironmentVariables();

  try {
    const url = `${BASE_URL}${ENDPOINT}`;
    const response = await fetch(url);
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.error('❌ Request failed');
      const text = await response.text();
      console.error('Response:', text);
      return;
    }

    const config = await response.json();
    console.log('✅ Response received');
    console.log('');
    console.log('Configuration:');
    console.log('==============');
    console.log(`Enabled: ${config.enabled}`);
    console.log(`Client ID: ${config.clientId ? `${config.clientId.substring(0, 10)}...` : 'null'}`);
    console.log(`Environment: ${config.environment}`);
    console.log('');

    // Validate response structure
    const requiredFields = ['enabled', 'clientId', 'environment'];
    const missingFields = requiredFields.filter(field => !(field in config));
    
    if (missingFields.length > 0) {
      console.error('❌ Missing required fields:', missingFields);
      return;
    }

    // Validate enabled state
    if (config.enabled) {
      if (!config.clientId) {
        console.error('❌ PayPal enabled but no client ID provided');
        return;
      }
      if (!config.environment) {
        console.error('❌ PayPal enabled but no environment specified');
        return;
      }
      console.log('✅ PayPal configuration is valid and enabled');
    } else {
      console.log('ℹ️  PayPal is disabled (FEATURE_PAYPAL != 1)');
    }

    console.log('');
    console.log('🎉 Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('- Ensure the development server is running (npm run dev)');
    console.error('- Check that Netlify functions are working');
    console.error('- Verify environment variables are set correctly');
  }
}

// Polyfill fetch for Node.js if needed
if (typeof fetch === 'undefined') {
  global.fetch = async (url) => {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https:');
      const client = isHttps ? https : http;
      
      const req = client.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            json: async () => JSON.parse(data),
            text: async () => data
          });
        });
      });
      
      req.on('error', reject);
    });
  };
}

// Run the test
testPayPalConfig();
