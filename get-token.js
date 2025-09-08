#!/usr/bin/env node

// Get verification token for testing
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

// Load environment variables from .env file
function loadEnv() {
  try {
    const envContent = readFileSync('.env', 'utf8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=');
        process.env[key] = value;
      }
    }
  } catch (error) {
    console.log('No .env file found or error reading it');
  }
}

async function getToken() {
  try {
    // Load environment variables
    loadEnv();
    
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
    const sql = neon(dbUrl);
    
    // Get the most recent verification token
    const tokens = await sql`
      SELECT ev.token, ev.expires_at, p.email
      FROM email_verifications ev
      JOIN profiles p ON p.id = ev.user_id
      WHERE ev.verified = false
      ORDER BY ev.created_at DESC
      LIMIT 1
    `;
    
    if (tokens.length > 0) {
      const token = tokens[0];
      console.log('Token:', token.token);
      console.log('Email:', token.email);
      console.log('Expires:', token.expires_at);
      
      // Test the verification
      console.log('\nTesting verification...');
      const response = await fetch('http://localhost:8888/.netlify/functions/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.token })
      });
      
      const result = await response.json();
      console.log('Response:', result);
    } else {
      console.log('No unverified tokens found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

getToken();
