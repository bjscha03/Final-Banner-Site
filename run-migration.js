#!/usr/bin/env node

// Direct migration script to create email verification tables
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

async function runMigration() {
  try {
    console.log('Starting database migration...');

    // Load environment variables
    loadEnv();

    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!dbUrl) {
      console.error('❌ Database URL not found in environment variables');
      console.log('Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE')));
      process.exit(1);
    }
    
    console.log('✅ Database URL found');
    const sql = neon(dbUrl);
    
    // 1. Add email verification fields to profiles table
    console.log('Adding email verification fields to profiles...');
    await sql`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS username VARCHAR(255)
    `;
    console.log('✅ Profiles table updated');
    
    // 2. Create email_verifications table
    console.log('Creating email_verifications table...');
    await sql`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        token VARCHAR(128) NOT NULL UNIQUE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        verified BOOLEAN DEFAULT FALSE,
        verified_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id)`;
    console.log('✅ email_verifications table created');
    
    // 3. Create email_events table
    console.log('Creating email_events table...');
    await sql`
      CREATE TABLE IF NOT EXISTS email_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type TEXT NOT NULL,
        to_email TEXT NOT NULL,
        provider_msg_id TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        order_id TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_events_order_id ON email_events(order_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_events_created_at ON email_events(created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_events_status ON email_events(status)`;
    console.log('✅ email_events table created');
    
    // 4. Create password_resets table
    console.log('Creating password_resets table...');
    await sql`
      CREATE TABLE IF NOT EXISTS password_resets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used BOOLEAN NOT NULL DEFAULT FALSE,
        used_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id)`;
    console.log('✅ password_resets table created');
    
    // 5. Add email status columns to orders table
    console.log('Adding email status columns to orders...');
    await sql`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS confirmation_email_status TEXT DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMP WITH TIME ZONE
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_orders_confirmation_email_status ON orders(confirmation_email_status)`;
    console.log('✅ Orders table updated with email status columns');
    
    // 6. Verify the migration
    console.log('Verifying migration...');
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('email_verifications', 'email_events', 'password_resets')
      ORDER BY table_name
    `;
    
    console.log('✅ Migration completed successfully!');
    console.log('Created tables:', tables.map(t => t.table_name).join(', '));
    
    // Test email verification table
    const testQuery = await sql`SELECT COUNT(*) as count FROM email_verifications`;
    console.log(`✅ email_verifications table accessible (${testQuery[0].count} records)`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();
