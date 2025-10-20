# Google Search Console Setup Guide

## Step 1: Access Google Search Console

1. Go to: https://search.google.com/search-console
2. Sign in with your Google account (use the same one you use for business)

## Step 2: Add Your Property

1. Click "Add Property" or "Start Now"
2. You'll see two options:
   - **Domain** (recommended)
   - **URL prefix**

### Option A: Domain Property (Recommended)
1. Select "Domain"
2. Enter: `bannersonthefly.com` (without https://)
3. Click "Continue"

### Option B: URL Prefix (Easier if you use Netlify)
1. Select "URL prefix"
2. Enter: `https://bannersonthefly.com`
3. Click "Continue"

## Step 3: Verify Ownership

Google will ask you to verify you own the site. **Best method for Netlify:**

### Method 1: HTML File Upload (Easiest for Netlify)
1. Google will give you an HTML file to download (e.g., `google1234567890abcdef.html`)
2. Download this file
3. Upload it to your site's `public/` folder
4. Commit and push to GitHub:
   ```bash
   git add public/google*.html
   git commit -m "Add Google Search Console verification file"
   git push
   ```
5. Wait 1-2 minutes for Netlify to deploy
6. Click "Verify" in Google Search Console

### Method 2: HTML Tag (Alternative)
1. Google will give you a meta tag like:
   ```html
   <meta name="google-site-verification" content="abc123..." />
   ```
2. Add this to your `index.html` file in the `<head>` section
3. Commit and push to GitHub
4. Wait for Netlify deployment
5. Click "Verify" in Google Search Console

### Method 3: DNS Record (If you manage DNS)
1. Google will give you a TXT record
2. Add it to your domain's DNS settings
3. Wait for DNS propagation (can take up to 48 hours)
4. Click "Verify"

## Step 4: Submit Your Sitemap

Once verified:

1. In Google Search Console, click "Sitemaps" in the left menu
2. Enter: `sitemap.xml`
3. Click "Submit"

You should see:
- Status: "Success"
- Discovered URLs: ~20+ pages

## Step 5: Request Indexing for Category Pages

For each category page, request immediate indexing:

1. Click "URL Inspection" in the left menu
2. Enter the full URL (e.g., `https://bannersonthefly.com/vinyl-banners`)
3. Click "Request Indexing"
4. Repeat for all 9 category pages:
   - https://bannersonthefly.com/vinyl-banners
   - https://bannersonthefly.com/mesh-banners
   - https://bannersonthefly.com/trade-show-banners
   - https://bannersonthefly.com/food-truck-banners
   - https://bannersonthefly.com/outdoor-banners
   - https://bannersonthefly.com/indoor-banners
   - https://bannersonthefly.com/event-banners
   - https://bannersonthefly.com/custom-banners
   - https://bannersonthefly.com/construction-banners

**Note:** You can only request indexing for a few URLs per day, so spread this out over 2-3 days.

## What to Expect

- **Within 24-48 hours:** Pages will start being indexed
- **Within 1 week:** Pages will appear in search results
- **Within 2-4 weeks:** You'll see impressions and clicks in Search Console
- **Within 1-3 months:** Rankings will improve

## Monitoring Your Progress

Check these sections in Google Search Console weekly:

1. **Performance** - See impressions, clicks, CTR, and position
2. **Coverage** - Verify all pages are indexed
3. **Enhancements** - Check for rich results eligibility
4. **Mobile Usability** - Ensure no mobile issues

---

**Need help? Let me know which verification method you want to use!**
