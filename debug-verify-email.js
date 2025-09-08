#!/usr/bin/env node

// Debug verify-email function
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

async function debugVerifyEmail() {
  try {
    // Load environment variables
    loadEnv();
    
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
    console.log('Database URL available:', !!dbUrl);
    
    const sql = neon(dbUrl);
    
    // Get a verification token
    const tokens = await sql`
      SELECT ev.token, ev.expires_at, ev.verified, p.email
      FROM email_verifications ev
      JOIN profiles p ON p.id = ev.user_id
      WHERE ev.verified = false
      ORDER BY ev.created_at DESC
      LIMIT 1
    `;
    
    if (tokens.length > 0) {
      const token = tokens[0];
      console.log('Found token for:', token.email);
      console.log('Token:', token.token);
      console.log('Expires:', token.expires_at);
      console.log('Verified:', token.verified);
      
      // Test the database query that the verify-email function uses
      console.log('\nTesting database query...');
      try {
        const verificationTokens = await sql`
          SELECT ev.id, ev.user_id, ev.expires_at, ev.verified, ev.verified_at, p.email
          FROM email_verifications ev
          JOIN profiles p ON p.id = ev.user_id
          WHERE ev.token = ${token.token}
        `;
        
        console.log('Query successful, found:', verificationTokens.length, 'records');
        if (verificationTokens.length > 0) {
          const vt = verificationTokens[0];
          console.log('Verification token details:');
          console.log('- ID:', vt.id);
          console.log('- User ID:', vt.user_id);
          console.log('- Email:', vt.email);
          console.log('- Expires:', vt.expires_at);
          console.log('- Verified:', vt.verified);
          console.log('- Verified at:', vt.verified_at);
          
          // Check if expired
          const now = new Date();
          const expires = new Date(vt.expires_at);
          console.log('- Is expired:', now > expires);
        }
      } catch (dbError) {
        console.error('Database query failed:', dbError);
      }
      
    } else {
      console.log('No unverified tokens found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugVerifyEmail();
