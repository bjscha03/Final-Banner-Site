# Canva Integration - 404 Fix Applied

## Issue
The Canva integration was returning 404 errors when trying to access `/api/canva/start`.

## Root Cause
Netlify Functions in subdirectories (`netlify/functions/canva/start.cjs`) are not accessible via `/api/canva/start`. Netlify requires functions to be at the root level of the functions directory.

## Solution Applied
1. **Moved function files** from subdirectory to root level:
   - `netlify/functions/canva/start.cjs` → `netlify/functions/canva-start.cjs`
   - `netlify/functions/canva/publish.cjs` → `netlify/functions/canva-publish.cjs`

2. **Updated frontend endpoint** in LivePreviewCard.tsx:
   - Changed from: `/api/canva/start`
   - Changed to: `/api/canva-start`

## Correct Endpoint URLs

### For Frontend (Button Click)
```javascript
const canvaStartUrl = `/api/canva-start?orderId=${orderId}&width=${width}&height=${height}`;
```

### For Canva Webhook Configuration
Set your Canva app webhook URL to:
```
https://bannersonthefly.com/api/canva-publish
```

## Deployment Status
✅ **Fixed and Deployed**
- Commit: fda5b80
- Date: October 22, 2025
- Status: Pushed to main, Netlify auto-deploying

## Testing
Once Netlify deployment completes (~2-5 minutes):

1. Visit https://bannersonthefly.com/design
2. Click "Design in Canva" button
3. Should now successfully redirect to `/api/canva-start` (no 404)
4. Canva app should open with correct parameters

## Files Changed
- `netlify/functions/canva-start.cjs` (renamed/moved)
- `netlify/functions/canva-publish.cjs` (renamed/moved)
- `src/components/design/LivePreviewCard.tsx` (endpoint URL updated)

## Next Steps
1. Wait for Netlify deployment to complete
2. Test the "Design in Canva" button again
3. Configure Canva webhook to: `https://bannersonthefly.com/api/canva-publish`
4. Test full integration flow

---

**Status**: ✅ Fix deployed, awaiting Netlify build completion
