# Local Testing Guide - Print Pipeline

## Pre-Testing Setup

### Step 1: Configure Environment Variables

Create or update your `.env` file:

```bash
# Copy the example if you don't have .env yet
cp .env.example .env
```

Edit `.env` and add/update these variables:

```bash
# Print Pipeline - START WITH FLAG OFF
ENABLE_PRINT_PIPELINE=false
VITE_ENABLE_PRINT_PIPELINE=false

# Print Configuration
PRINT_DEFAULT_DPI=150
PRINT_BLEED_IN=0.25
PRINT_COLOR_SPACE=srgb
PRINT_FORMAT=png

# Cloudinary (use your existing credentials)
CLOUDINARY_CLOUD_NAME=your_cloud_name_here
CLOUDINARY_API_KEY=your_api_key_here
CLOUDINARY_API_SECRET=your_api_secret_here
VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name_here
```

---

## Test 1: Feature Flag OFF (Default Behavior)

**Goal**: Verify site works exactly as before with NO changes.

### 1.1 Verify Environment
```bash
# In .env, ensure:
ENABLE_PRINT_PIPELINE=false
VITE_ENABLE_PRINT_PIPELINE=false
```

### 1.2 Start Dev Server
```bash
npm run dev
```

### 1.3 Test Checklist
- [ ] Site loads without errors
- [ ] Can log in as admin
- [ ] Can view orders page
- [ ] Existing "Download PDF" button appears
- [ ] NO "Print-Grade PDF (Beta)" button
- [ ] NO "Quality Check" button
- [ ] AI banner generation works normally (if you test it)

**Expected Result**: ✅ Everything works exactly as before. Zero changes visible.

---

## Test 2: Build Verification

**Goal**: Ensure the code builds successfully.

### 2.1 Run Build
```bash
npm run build
```

### 2.2 Check Output
- [ ] Build completes successfully
- [ ] No TypeScript errors
- [ ] No build errors

**Expected Result**: ✅ Build succeeds with no errors.

---

## Test 3: Feature Flag ON (New Features - WITHOUT OrderDetails Integration)

**Goal**: Test what we have so far (AI print derivatives).

### 3.1 Enable Feature Flag
Edit `.env`:
```bash
ENABLE_PRINT_PIPELINE=true
VITE_ENABLE_PRINT_PIPELINE=true
```

### 3.2 Restart Dev Server
```bash
# Stop the dev server (Ctrl+C)
npm run dev
```

### 3.3 Test AI Print Derivatives (If You Have AI Feature)

If you have the AI banner generation feature:

1. Go to AI banner generation page
2. Generate a banner with AI
3. **Check browser console** - you should see:
   ```
   [Print-Derivative] Queueing print derivative generation...
   [Print-Derivative] Batch generating print derivatives
   [Print-Derivative] Print derivatives generated: 3
   ```

**Expected Result**: ✅ AI generation works, print derivatives are queued in background.

**Note**: The UI buttons won't appear yet because OrderDetails.tsx hasn't been integrated.

---

## Test 4: OrderDetails Integration (Manual Step)

**Goal**: Add the Print Pipeline UI to the admin orders page.

### 4.1 Follow Integration Guide

Open `ORDERDETAILS-INTEGRATION-GUIDE.md` and follow the 5 steps:

1. Add imports (3 lines)
2. Add state variables (3 lines)
3. Add handler functions (2 functions)
4. Add UI buttons (2 buttons)
5. Add modal component (1 component)

### 4.2 Verify No TypeScript Errors

Check your IDE for red squiggly lines. If you see any:
- Check import paths are correct
- Check for typos
- Check for duplicate declarations

### 4.3 Restart Dev Server
```bash
# Stop and restart
npm run dev
```

---

## Test 5: Full Feature Testing (After Integration)

**Goal**: Test all Print Pipeline features.

### 5.1 Test Quality Check Modal

1. Log in as admin
2. Go to Orders page
3. Find an order with a banner
4. Click **"Quality Check"** button
5. Modal should open showing:
   - Banner specifications
   - Asset quality analysis
   - Effective DPI for each asset
   - Pass/Fail badges
   - Quality guidelines

**Expected Result**: ✅ Modal opens and displays quality information.

### 5.2 Test Print-Grade PDF Download

1. On the same order, click **"Print-Grade PDF (Beta)"** button
2. Wait for PDF to generate (may take 5-10 seconds)
3. PDF should download automatically
4. Open the PDF and verify:
   - File opens correctly
   - Image is high quality
   - Zoom to 800% - text should be crisp (vector)
   - Crop marks visible at corners

**Expected Result**: ✅ PDF downloads and is high quality.

### 5.3 Test Existing "Download PDF" Still Works

1. Click the original **"Download PDF"** button
2. Verify it still works exactly as before

**Expected Result**: ✅ Original PDF export unchanged.

---

## Test 6: Feature Flag OFF Again (Regression Test)

**Goal**: Verify we can turn features off cleanly.

### 6.1 Disable Feature Flag
Edit `.env`:
```bash
ENABLE_PRINT_PIPELINE=false
VITE_ENABLE_PRINT_PIPELINE=false
```

### 6.2 Restart Dev Server
```bash
npm run dev
```

### 6.3 Verify
- [ ] "Print-Grade PDF (Beta)" button is HIDDEN
- [ ] "Quality Check" button is HIDDEN
- [ ] Original "Download PDF" still works
- [ ] Site works normally

**Expected Result**: ✅ New features are hidden, site works as before.

---

## Troubleshooting

### Issue: "Cannot find module '@/components/admin/PDFQualityCheck'"

**Solution**: 
- Verify file exists: `ls -la src/components/admin/PDFQualityCheck.tsx`
- Check import path in OrderDetails.tsx

### Issue: "Cannot find module '@/utils/printPipeline'"

**Solution**:
- Verify file exists: `ls -la src/utils/printPipeline.ts`
- Check import path in OrderDetails.tsx

### Issue: Buttons not appearing (with flag ON)

**Solution**:
- Check `.env` has `VITE_ENABLE_PRINT_PIPELINE=true`
- Restart dev server after changing `.env`
- Check you're logged in as admin
- Check browser console for errors

### Issue: Print-Grade PDF returns 403

**Solution**:
- Check `.env` has `ENABLE_PRINT_PIPELINE=true` (no VITE_ prefix for server)
- Restart Netlify Functions: `netlify dev` instead of `npm run dev`

### Issue: Build fails

**Solution**:
- Check for TypeScript errors in IDE
- Run `npm run build` to see detailed errors
- Check all imports are correct
- Check for duplicate declarations

---

## Testing Checklist Summary

- [ ] Test 1: Feature flag OFF - site works as before
- [ ] Test 2: Build succeeds
- [ ] Test 3: Feature flag ON - AI derivatives queue (optional)
- [ ] Test 4: OrderDetails integration complete
- [ ] Test 5: Quality Check modal works
- [ ] Test 6: Print-Grade PDF downloads
- [ ] Test 7: Original PDF still works
- [ ] Test 8: Feature flag OFF - features hidden

---

## Next Steps After Testing

Once all tests pass:

1. **Commit OrderDetails changes** (if you made them)
2. **Review all changes** one more time
3. **Decide**: Ready to push to remote? Or need more testing?

---

## Quick Commands Reference

```bash
# Start dev server
npm run dev

# Build
npm run build

# Start with Netlify Functions
netlify dev

# Check git status
git status

# View current branch
git branch

# View commit log
git log --oneline -5
```

---

## Current Status

**Branch**: `feat/print-pipeline` (local only)  
**Commits**: 2 commits (Phase 1 + Phase 2)  
**Files Modified**: 1 (ai-generate-banner.cjs)  
**Files Created**: 11 new files  
**Build Status**: ✅ Succeeds  
**Production**: ✅ Not pushed (safe)  

Ready to test! 🚀
