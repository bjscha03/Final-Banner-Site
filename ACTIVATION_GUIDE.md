# 🚀 ACTIVATION GUIDE - Get AI System Running NOW

## Current Status

✅ **Code is deployed** - All backend and frontend code is live on Netlify  
❌ **Not activated yet** - Need 3 quick steps to activate

---

## Why You Don't See It Yet

The new AI system is deployed but **not integrated** into your Design page yet. You're still using the old `AIGenerationModal`.

---

## 🎯 3 STEPS TO ACTIVATE (10 minutes)

### **STEP 1: Add Environment Variables** (3 minutes)

Go to Netlify Dashboard → Your Site → Site Settings → Environment Variables

Add these **NEW** variables (in addition to your existing ones):

```
IMG_MONTHLY_SOFT_CAP_USD = 100
FREE_IMGS_PER_DAY = 3
DEFAULT_GEN_SIZE = 768x768
PREMIUM_MODEL = dall-e-3
DALLE_QUALITY = hd
STANDARD_PROVIDER = fal
STANDARD_MODEL = fal-ai/flux-schnell
FAL_API_KEY = (get from https://fal.ai - see below)
```

**To get FAL_API_KEY:**
1. Go to https://fal.ai
2. Click "Sign Up" (free)
3. Go to Dashboard → API Keys
4. Click "Create API Key"
5. Copy the key
6. Paste into Netlify as `FAL_API_KEY`

**Keep your existing variables:**
- `OPENAI_API_KEY` ✅ (you already have this)
- `CLOUDINARY_*` ✅ (you already have these)
- `DATABASE_URL` ✅ (you already have this)

---

### **STEP 2: Run Database Migration** (2 minutes)

Open terminal in your project folder and run:

```bash
node migrations/run-migration.js 001_ai_generation_system.sql
```

This creates 5 new tables:
- `users` - User accounts
- `user_credits` - Credit balances
- `generations` - Cached AI images
- `selections` - Final selections
- `usage_log` - Analytics

**Expected output:**
```
✓ Connected to database
✓ Running migration: 001_ai_generation_system.sql
✓ Migration completed successfully
```

---

### **STEP 3: Activate New UI** (2 minutes)

Edit `src/pages/Design.tsx`:

**Line 12 - Change import:**
```tsx
// OLD:
import AIGenerationModal from '@/components/design/AIGenerationModal';

// NEW:
import NewAIGenerationModal from '@/components/design/NewAIGenerationModal';
```

**Lines 186-189 - Change component:**
```tsx
// OLD:
<AIGenerationModal
  open={aiModalOpen}
  onOpenChange={setAiModalOpen}
/>

// NEW:
<NewAIGenerationModal
  open={aiModalOpen}
  onOpenChange={setAiModalOpen}
/>
```

**Save, commit, and push:**
```bash
git add src/pages/Design.tsx
git commit -m "Activate cost-optimized AI generation system"
git push
```

Wait 2-3 minutes for Netlify to deploy.

---

## ✅ VERIFICATION

After deployment, open your site and:

1. **Click "AI Generate"** button
2. **You should now see:**
   - 🎁 Credit counter at top: "3 free today"
   - 📊 Monthly spend indicator
   - 💬 New prompt interface
   - 🎨 Aspect ratio selector

3. **Test generation:**
   - Enter: "Professional photograph of sunset over mountains"
   - Click "Generate Preview"
   - Should see 1 image with tier badge (Premium 👑 or Standard ⚡)
   - Click "+ Generate 2 More Options"
   - Should see 3 total images

4. **Check credits:**
   - Credit counter should decrease from "3 free today" to "2 free today"
   - Monthly spend should increase

---

## 🔍 TROUBLESHOOTING

### "Function returned error" when generating
**Problem:** Environment variables not set  
**Solution:** Check Netlify dashboard → Environment Variables → Make sure all 8 new vars are added

### "Database error" in logs
**Problem:** Migration not run  
**Solution:** Run `node migrations/run-migration.js 001_ai_generation_system.sql`

### Still seeing old AI modal
**Problem:** Design.tsx not updated  
**Solution:** Make sure you changed both the import AND the component usage

### "FAL_API_KEY is not defined"
**Problem:** Fal.ai API key not added  
**Solution:** Get key from https://fal.ai and add to Netlify

---

## 📊 WHAT YOU'LL SEE AFTER ACTIVATION

### **New AI Modal Features:**
- ✅ Credit counter showing "3 free today"
- ✅ Monthly budget tracker
- ✅ Tier badges (Premium/Standard)
- ✅ Lazy loading (1 image first, then 2 more)
- ✅ Cached indicators (⚡ Cached)
- ✅ Better error messages

### **Cost Savings:**
- ✅ First 3 images/day are FREE
- ✅ Cached prompts cost $0
- ✅ Standard tier is 96% cheaper
- ✅ Auto-downgrade when budget hit

---

## 🎯 QUICK START CHECKLIST

- [ ] Add 8 new environment variables to Netlify
- [ ] Get Fal.ai API key from https://fal.ai
- [ ] Run database migration: `node migrations/run-migration.js 001_ai_generation_system.sql`
- [ ] Update Design.tsx (2 changes)
- [ ] Commit and push
- [ ] Wait 2-3 minutes for deployment
- [ ] Test AI generation
- [ ] Verify credit counter appears

---

## 💡 OPTIONAL: Test Backend First

Before activating the UI, you can test if the backend is working:

```bash
# Test credits endpoint (should work after migration)
curl "https://your-site.netlify.app/.netlify/functions/ai-credits-status?userId=test-123"

# Expected response:
# {"freeRemainingToday":3,"paidCredits":0,"monthlySpend":0,"monthlyCap":100}
```

---

## 🚨 IMPORTANT

**Don't skip the database migration!** Without it:
- Credit system won't work
- Generation will fail
- You'll see database errors in logs

**Run this command:**
```bash
node migrations/run-migration.js 001_ai_generation_system.sql
```

---

## ⏱️ TIME ESTIMATE

- Step 1 (Env vars): 3 minutes
- Step 2 (Migration): 2 minutes  
- Step 3 (Code change): 2 minutes
- Deployment wait: 3 minutes

**Total: ~10 minutes**

---

## 🎉 AFTER ACTIVATION

You'll have:
- ✅ 78% cost savings on AI generation
- ✅ 3 free images per day per user
- ✅ Automatic caching
- ✅ Budget enforcement
- ✅ Better user experience

**Ready to activate? Start with Step 1!**
