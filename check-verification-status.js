#!/usr/bin/env node

// Check verification status
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

async function checkStatus() {
  try {
    // Load environment variables
    loadEnv();
    
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
    const sql = neon(dbUrl);
    
    // Check verification status for bjscha02@gmail.com
    const profiles = await sql`
      SELECT email, email_verified, email_verified_at
      FROM profiles
      WHERE email = 'bjscha02@gmail.com'
    `;
    
    if (profiles.length > 0) {
      const profile = profiles[0];
      console.log('Profile verification status:');
      console.log('- Email:', profile.email);
      console.log('- Verified:', profile.email_verified);
      console.log('- Verified at:', profile.email_verified_at);
    } else {
      console.log('Profile not found');
    }
    
    // Check email verification record
    const verifications = await sql`
      SELECT ev.verified, ev.verified_at, p.email
      FROM email_verifications ev
      JOIN profiles p ON p.id = ev.user_id
      WHERE p.email = 'bjscha02@gmail.com'
    `;
    
    if (verifications.length > 0) {
      const verification = verifications[0];
      console.log('\nVerification record:');
      console.log('- Email:', verification.email);
      console.log('- Verified:', verification.verified);
      console.log('- Verified at:', verification.verified_at);
    } else {
      console.log('Verification record not found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkStatus();
