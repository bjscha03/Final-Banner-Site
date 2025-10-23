#!/usr/bin/env node

/**
 * Seed WEEK20 promo code into the database
 * 
 * This script creates a 20% off promo code that:
 * - Can be used once per customer (tracked by email/user_id)
 * - Expires at the end of the current week (Saturday 11:59 PM)
 * - Is tracked in PostHog analytics
 */

const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

async function seedWeek20Promo() {
  const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ No database URL found in environment variables');
    console.error('   Please set DATABASE_URL, NETLIFY_DATABASE_URL, or VITE_DATABASE_URL');
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  // Calculate end of current week (Saturday 11:59 PM)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  const daysUntilSaturday = dayOfWeek === 6 ? 0 : (6 - dayOfWeek + 7) % 7;
  
  const expiresAt = new Date(now);
  expiresAt.setDate(now.getDate() + daysUntilSaturday);
  expiresAt.setHours(23, 59, 59, 999);

  console.log('🎯 Creating WEEK20 promo code...');
  console.log(`   Expires: ${expiresAt.toLocaleString()}`);

  try {
    // First, run the migration to add the new columns if they don't exist
    console.log('📊 Ensuring database schema is up to date...');
    
    await sql`
      ALTER TABLE discount_codes 
      ADD COLUMN IF NOT EXISTS used_by_email TEXT[],
      ADD COLUMN IF NOT EXISTS max_uses_per_customer INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS max_total_uses INTEGER
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_discount_codes_used_by_email 
      ON discount_codes USING GIN(used_by_email)
    `;

    console.log('✅ Database schema updated');

    // Check if WEEK20 already exists
    const existing = await sql`
      SELECT id, code, expires_at 
      FROM discount_codes 
      WHERE code = 'WEEK20'
      LIMIT 1
    `;

    if (existing.length > 0) {
      console.log('⚠️  WEEK20 code already exists');
      console.log(`   Current expiry: ${new Date(existing[0].expires_at).toLocaleString()}`);
      
      // Update the expiry date
      await sql`
        UPDATE discount_codes
        SET 
          expires_at = ${expiresAt.toISOString()},
          updated_at = NOW()
        WHERE code = 'WEEK20'
      `;
      
      console.log('✅ Updated WEEK20 expiry date to end of this week');
    } else {
      // Create new WEEK20 code
      const result = await sql`
        INSERT INTO discount_codes (
          code,
          discount_percentage,
          discount_amount_cents,
          expires_at,
          single_use,
          used,
          max_uses_per_customer,
          max_total_uses,
          created_at,
          updated_at
        ) VALUES (
          'WEEK20',
          20,
          NULL,
          ${expiresAt.toISOString()},
          TRUE,
          FALSE,
          1,
          NULL,
          NOW(),
          NOW()
        )
        RETURNING id, code, discount_percentage, expires_at
      `;

      console.log('✅ Created WEEK20 promo code:');
      console.log(`   ID: ${result[0].id}`);
      console.log(`   Code: ${result[0].code}`);
      console.log(`   Discount: ${result[0].discount_percentage}%`);
      console.log(`   Expires: ${new Date(result[0].expires_at).toLocaleString()}`);
    }

    console.log('\n🎉 WEEK20 promo code is ready!');
    console.log('   Customers can use it once per email/account');
    console.log('   Expires Saturday at 11:59 PM');

  } catch (error) {
    console.error('❌ Error seeding WEEK20 promo:', error);
    process.exit(1);
  }
}

// Run the seed function
seedWeek20Promo()
  .then(() => {
    console.log('\n✅ Seed complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });
