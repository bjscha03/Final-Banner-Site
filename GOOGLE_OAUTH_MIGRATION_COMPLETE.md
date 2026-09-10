# Google OAuth Database Migration - COMPLETE ✅

## Problem Identified
```
NeonDbError: column "google_id" of relation "profiles" does not exist
```

The `google-callback.ts` function was trying to update a `google_id` column that didn't exist in the `profiles` table.

## Root Cause
The database schema was missing OAuth-related columns:
- ❌ `google_id` - for storing Google OAuth user IDs
- ❌ `linkedin_id` - for storing LinkedIn OAuth user IDs  
- ❌ `password_hash` - for email/password authentication

## Solution Implemented

### 1. Created Migration SQL Script
**File:** `database/migrations/add-oauth-columns-to-profiles.sql`

Adds three columns to the `profiles` table:
- `google_id VARCHAR(255) UNIQUE` - Google OAuth user ID
- `linkedin_id VARCHAR(255) UNIQUE` - LinkedIn OAuth user ID
- `password_hash TEXT` - Bcrypt hashed password

### 2. Created Migration Function
**File:** `netlify/functions/run-oauth-migration.cjs`

Netlify serverless function to run the migration remotely.

### 3. Executed Migration
Ran migration directly against Neon database using local script.

**Results:**
```
✅ Migration completed successfully!
✅ Columns added:
   - google_id (character varying, nullable: YES)
   - linkedin_id (character varying, nullable: YES)
   - password_hash (text, nullable: YES)
```

## Database Schema Changes

### Before
```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    username VARCHAR(255),
    is_admin BOOLEAN DEFAULT FALSE,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### After
```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    username VARCHAR(255),
    is_admin BOOLEAN DEFAULT FALSE,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    google_id VARCHAR(255) UNIQUE,          -- ✅ NEW
    linkedin_id VARCHAR(255) UNIQUE,        -- ✅ NEW
    password_hash TEXT,                     -- ✅ NEW
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_profiles_google_id ON profiles(google_id);
CREATE INDEX idx_profiles_linkedin_id ON profiles(linkedin_id);
```

## Testing Status

### Automated Tests ✅
- ✅ google-auth endpoint returns authorization URL
- ✅ google-callback function is deployed
- ✅ Database columns exist and are accessible

### Manual Testing Required 🧪
**Test the full Google OAuth flow:**

1. Go to: https://bannersonthefly.com/sign-in
2. Click "Continue with Google"
3. Complete Google authentication

**Expected Results:**
- ✅ Redirected to home page (/)
- ✅ User logged in (visible in top-right corner)
- ✅ User data stored in localStorage as `banners_current_user`
- ✅ If new user: 10 AI credits granted
- ✅ If existing user: Google ID linked to existing profile

## Commits

1. **bcdb5ce** - "FIX: Google OAuth callback - Use correct database table and neon client"
   - Fixed database client and table name
   - Changed from `users` to `profiles` table
   - Changed from `query` to `neon` client

2. **9ae89be** - "Add OAuth migration function and SQL script"
   - Added migration SQL script
   - Added Netlify function to run migration

3. **Migration Executed** - Directly via Node.js script
   - Added `google_id`, `linkedin_id`, `password_hash` columns
   - Created unique constraints and indexes

## Files Modified/Created

### Created
- `database/migrations/add-oauth-columns-to-profiles.sql` - Migration SQL
- `netlify/functions/run-oauth-migration.cjs` - Migration function
- `GOOGLE_OAUTH_MIGRATION_COMPLETE.md` - This document

### Modified
- `netlify/functions/google-callback.ts` - Fixed database queries

## Next Steps

1. ✅ Database schema updated
2. ✅ Code deployed to production
3. 🧪 **TEST GOOGLE LOGIN NOW!**
4. 📊 Monitor Netlify function logs for any errors
5. 🎉 Confirm users can successfully log in with Google

## Debugging

If issues persist, check:

```bash
# View function logs
netlify functions:log google-callback

# Test auth endpoint
curl -s "https://bannersonthefly.com/.netlify/functions/google-auth" | jq

# Verify database columns
# Run this in Neon SQL Editor:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN ('google_id', 'linkedin_id', 'password_hash');
```

---

**Status:** ✅ READY FOR TESTING

The database schema issue has been completely resolved. Google OAuth should now work end-to-end!
