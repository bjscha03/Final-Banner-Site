# 🚨 CRITICAL: Database Migration Required

## The Problem

Your **Abandoned Carts admin page is completely broken** because the database is missing required columns.

**Error:** `column "recovered_at" does not exist`

## The Solution

You need to run a database migration in your **Neon PostgreSQL** console.

---

## Step-by-Step Instructions

### 1. Open Neon Console
Go to: **https://console.neon.tech/**

### 2. Navigate to SQL Editor
- Select your project
- Click **"SQL Editor"** in the left sidebar

### 3. Run the Migration
Open the file: `migrations/006_add_recovery_tracking_columns.sql` and copy/paste it into the SQL Editor, then click Run.

### 4. Verify Success
The migration includes verification queries that will show the new columns were created.

### 5. Test the Admin Panel
- Go to your admin panel → Abandoned Carts tab
- The page should now load without errors

---

## What This Migration Does

✅ Adds `recovered_at` column - tracks when a cart was recovered  
✅ Adds `recovered_order_id` column - links to the order that recovered the cart  
✅ Adds performance indexes for faster queries  
✅ Fixes the "column does not exist" error  

---

## Other Fixes Included

1. **Mobile Card Display** - Fixed $0.00 showing on mobile
2. **UUID Validation** - Fixed cart sync errors for admin users
3. **Type Conversions** - Fixed type errors in cart calculations

**Note:** This project uses **Neon PostgreSQL**, not Supabase.
