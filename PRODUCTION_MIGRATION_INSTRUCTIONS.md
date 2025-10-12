# Production Database Migration Instructions

## ⚠️ IMPORTANT: Run This Migration on Production

The `saved_ai_images` table was created in the local database, but it also needs to be created in the **production database** for the save functionality to work on the live site.

---

## Option 1: Run Migration via Netlify CLI (Recommended)

If you have Netlify CLI installed and configured:

```bash
# Set the production database URL
export DATABASE_URL="your-production-database-url"

# Run the migration
node migrations/run-migration.cjs 003_saved_ai_images_fixed.sql
```

---

## Option 2: Run Migration Directly on Neon Database

1. Go to your Neon database console: https://console.neon.tech/
2. Select your production database
3. Open the SQL Editor
4. Copy and paste the following SQL:

```sql
-- Create saved_ai_images table
CREATE TABLE IF NOT EXISTS saved_ai_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  prompt TEXT,
  aspect TEXT,
  tier TEXT DEFAULT 'premium',
  generation_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_saved_ai_images_user_id ON saved_ai_images(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_ai_images_created_at ON saved_ai_images(created_at DESC);
```

5. Click "Run" to execute the SQL

---

## Option 3: Use Netlify Environment Variables

If your production database URL is stored in Netlify environment variables:

1. Go to Netlify Dashboard → Your Site → Site Settings → Environment Variables
2. Copy the `DATABASE_URL` or `NETLIFY_DATABASE_URL` value
3. Run locally:

```bash
export DATABASE_URL="paste-the-production-url-here"
node migrations/run-migration.cjs 003_saved_ai_images_fixed.sql
```

---

## Verification

After running the migration, verify it worked:

```bash
# Connect to production database
export DATABASE_URL="your-production-database-url"

# Run verification script
node check-table.cjs
```

You should see output like:
```
Tables found: [ { table_name: 'saved_ai_images' } ]

Columns:
  - id: uuid
  - user_id: text
  - image_url: text
  - prompt: text
  - aspect: text
  - tier: text
  - generation_id: text
  - created_at: timestamp without time zone
  - updated_at: timestamp without time zone
```

---

## Testing After Migration

Once the migration is complete and the site is deployed:

1. Generate an AI image
2. Click the bookmark icon
3. You should see a success message instead of "Failed to save image"
4. Navigate to "My AI Images" to see your saved images

---

## Troubleshooting

If you still see errors after running the migration:

1. Check Netlify function logs:
   - Go to Netlify Dashboard → Your Site → Functions → save-ai-image
   - Look for error messages

2. Verify the table exists:
   - Run the verification script above
   - Or check directly in Neon console

3. Check for foreign key issues:
   - If you see foreign key constraint errors, run:
   ```sql
   ALTER TABLE saved_ai_images DROP CONSTRAINT IF EXISTS fk_user;
   ```

---

## Need Help?

If you encounter any issues, check:
- Netlify function logs
- Neon database console
- Browser console for client-side errors
