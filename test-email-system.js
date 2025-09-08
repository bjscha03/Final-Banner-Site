#!/usr/bin/env node

// Test script for email verification system
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

async function testEmailSystem() {
  try {
    console.log('Testing email verification system...');
    
    // Load environment variables
    loadEnv();
    
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!dbUrl) {
      console.error('❌ Database URL not found');
      process.exit(1);
    }
    
    const sql = neon(dbUrl);
    
    // Check existing verification records
    console.log('\n📋 Checking existing email verification records...');
    const verifications = await sql`
      SELECT ev.id, ev.token, ev.expires_at, ev.verified, p.email, p.email_verified
      FROM email_verifications ev
      JOIN profiles p ON p.id = ev.user_id
      ORDER BY ev.created_at DESC
      LIMIT 5
    `;
    
    if (verifications.length > 0) {
      console.log('Found verification records:');
      verifications.forEach((v, i) => {
        console.log(`  ${i + 1}. Email: ${v.email}`);
        console.log(`     Token: ${v.token.substring(0, 20)}...`);
        console.log(`     Verified: ${v.verified} (Profile: ${v.email_verified})`);
        console.log(`     Expires: ${v.expires_at}`);
        console.log('');
      });
    } else {
      console.log('No verification records found');
    }
    
    // Check profiles
    console.log('📋 Checking user profiles...');
    const profiles = await sql`
      SELECT id, email, email_verified, is_admin, created_at
      FROM profiles
      ORDER BY created_at DESC
      LIMIT 5
    `;
    
    if (profiles.length > 0) {
      console.log('Found user profiles:');
      profiles.forEach((p, i) => {
        console.log(`  ${i + 1}. Email: ${p.email}`);
        console.log(`     Verified: ${p.email_verified}`);
        console.log(`     Admin: ${p.is_admin}`);
        console.log(`     Created: ${p.created_at}`);
        console.log('');
      });
    } else {
      console.log('No user profiles found');
    }
    
    // Check orders with email status
    console.log('📋 Checking recent orders with email status...');
    const orders = await sql`
      SELECT id, email, total_cents, confirmation_email_status, confirmation_email_sent_at, created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 5
    `;
    
    if (orders.length > 0) {
      console.log('Found recent orders:');
      orders.forEach((o, i) => {
        console.log(`  ${i + 1}. Order: ${o.id.substring(0, 8)}...`);
        console.log(`     Email: ${o.email}`);
        console.log(`     Total: $${(o.total_cents / 100).toFixed(2)}`);
        console.log(`     Email Status: ${o.confirmation_email_status}`);
        console.log(`     Email Sent: ${o.confirmation_email_sent_at || 'Not sent'}`);
        console.log(`     Created: ${o.created_at}`);
        console.log('');
      });
    } else {
      console.log('No orders found');
    }
    
    // Check email events
    console.log('📋 Checking email events log...');
    const emailEvents = await sql`
      SELECT type, to_email, status, error_message, created_at
      FROM email_events
      ORDER BY created_at DESC
      LIMIT 5
    `;
    
    if (emailEvents.length > 0) {
      console.log('Found email events:');
      emailEvents.forEach((e, i) => {
        console.log(`  ${i + 1}. Type: ${e.type}`);
        console.log(`     To: ${e.to_email}`);
        console.log(`     Status: ${e.status}`);
        if (e.error_message) {
          console.log(`     Error: ${e.error_message}`);
        }
        console.log(`     Time: ${e.created_at}`);
        console.log('');
      });
    } else {
      console.log('No email events found');
    }
    
    console.log('✅ Email system test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testEmailSystem();
