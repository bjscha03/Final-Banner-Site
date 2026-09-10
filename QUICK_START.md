# 🚀 QUICK START - Canva Token Security

## ⚡ Fast Track Deployment (90 minutes)

### Step 1: Database Migration (10 min)

```bash
# Option A: Using Neon Console (EASIEST)
# 1. Go to https://console.neon.tech
# 2. Select your project
# 3. Click "SQL Editor"
# 4. Copy/paste contents of migrations/007_canva_token_storage.sql
# 5. Click "Run"

# Option B: Using psql
psql $DATABASE_URL < migrations/007_canva_token_storage.sql
```

### Step 2: Install Dependencies (2 min)

```bash
npm install @neondatabase/serverless
```

### Step 3: Update canva-callback.cjs (10 min)

Add this at the top:
```javascript
const { neon } = require('@neondatabase/serverless');
```

Find line ~200 where it says:
```javascript
redirectUrl.searchParams.set('token', access_token); // ❌ DELETE THIS
```

Replace with:
```javascript
// ✅ SECURE - Store token in database
const db = neon(process.env.DATABASE_URL);
const expiresAt = new Date(Date.now() + ((tokenResponse.expires_in || 3600) * 1000));

await db`
  INSERT INTO canva_tokens (user_id, access_token, refresh_token, expires_at, scope)
  VALUES (
    ${userId},
    ${access_token},
    ${tokenResponse.refresh_token || null},
    ${expiresAt.toISOString()},
    ${tokenResponse.scope || 'design:content:read design:content:write'}
  )
  ON CONFLICT (user_id) DO UPDATE SET
    access_token = ${access_token},
    refresh_token = COALESCE(${tokenResponse.refresh_token}, canva_tokens.refresh_token),
    expires_at = ${expiresAt.toISOString()},
    updated_at = NOW(),
    disconnected_at = NULL
`;

// Don't pass token in URL
redirectUrl.searchParams.set('userId', userId);
redirectUrl.searchParams.set('success', 'true');
```

### Step 4: Update canva-export.cjs (5 min)

Add this at the top:
```javascript
const { neon } = require('@neondatabase/serverless');
```

Find line ~20 where it says:
```javascript
const { designId, accessToken } = JSON.parse(event.body); // ❌ DELETE THIS
```

Replace with:
```javascript
// ✅ SECURE - Get token from database
const { designId, userId } = JSON.parse(event.body);

const db = neon(process.env.DATABASE_URL);
const tokens = await db`
  SELECT access_token 
  FROM canva_tokens
  WHERE user_id = ${userId} 
  AND disconnected_at IS NULL
  LIMIT 1
`;

if (tokens.length === 0) {
  throw new Error('No Canva token found. Please reconnect your Canva account.');
}

const accessToken = tokens[0].access_token;
```

### Step 5: Update Frontend (30 min)

Find where you call canva-export (probably in a React component):

**Before:**
```javascript
const response = await fetch('/.netlify/functions/canva-export', {
  method: 'POST',
  body: JSON.stringify({
    designId: designId,
    accessToken: token  // ❌ DELETE
  })
});
```

**After:**
```javascript
const response = await fetch('/.netlify/functions/canva-export', {
  method: 'POST',
  body: JSON.stringify({
    designId: designId,
    userId: userId  // ✅ ADD (get from URL params or user context)
  })
});
```

### Step 6: Test Locally (30 min)

```bash
# Start dev server
npm run dev

# Test OAuth flow:
# 1. Go to http://localhost:5173/design
# 2. Click "Edit with Canva"
# 3. Authorize
# 4. Check URL - should NOT contain token
# 5. Check database:
psql $DATABASE_URL -c "SELECT user_id, expires_at FROM canva_tokens;"
```

### Step 7: Deploy (5 min)

```bash
git add .
git commit -m "Implement secure Canva token storage"
git push origin main
```

Netlify will automatically deploy!

---

## ✅ Verification

After deployment, test:

1. **OAuth Flow**: User can authorize Canva
2. **Token Storage**: Check database for token
3. **No Token in URL**: Verify URL doesn't contain token
4. **Export Works**: Test exporting a design

---

## 🆘 Troubleshooting

**Error: "No Canva token found"**
- User needs to re-authorize Canva after migration
- Check database: `SELECT * FROM canva_tokens;`

**Error: "Database URL not configured"**
- Verify `DATABASE_URL` environment variable in Netlify

**Error: "Cannot find module @neondatabase/serverless"**
- Run: `npm install @neondatabase/serverless`
- Redeploy

---

## 📞 Need Help?

See `IMPLEMENTATION_COMPLETE.md` for detailed instructions.

---

**Estimated Time:** 90 minutes  
**Difficulty:** Medium  
**Risk:** Low (backups created)

Good luck! 🚀
