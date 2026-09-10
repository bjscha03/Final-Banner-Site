# Print Pipeline (Beta) - Documentation

## Overview

The Print Pipeline is a **feature-flagged, additive enhancement** to the existing PDF export system. It provides:

1. **Print-Grade PDF Generation** - Lossless, color-managed PDFs optimized for professional printing
2. **Quality Check Diagnostics** - Real-time DPI and color space verification
3. **AI Print Derivatives** - Automatic high-resolution variants for AI-generated images

**IMPORTANT**: This feature is **completely non-destructive**. The existing "Download PDF" functionality remains **100% unchanged**. All new features are gated behind the `ENABLE_PRINT_PIPELINE` environment variable.

---

## Feature Flag

### Environment Variable

```bash
ENABLE_PRINT_PIPELINE=false  # Default: disabled
```

- **When `false`**: Site behaves exactly as before. No new buttons, no new endpoints, no changes.
- **When `true`**: Enables Print-Grade PDF button, Quality Check modal, and AI print derivatives.

---

## Local Setup

### 1. Add Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Print Pipeline (Beta) - Feature Flag
ENABLE_PRINT_PIPELINE=true
VITE_ENABLE_PRINT_PIPELINE=true

# Print Pipeline Configuration
PRINT_DEFAULT_DPI=150
PRINT_BLEED_IN=0.25
PRINT_COLOR_SPACE=srgb
PRINT_FORMAT=png

# Cloudinary (required)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
```

### 2. Start Local Development Server

```bash
npm run dev
```

### 3. Start Netlify Functions Locally (Optional)

```bash
netlify dev
```

---

## How to Use

### Admin UI

When `ENABLE_PRINT_PIPELINE=true`, admins will see **three buttons** for each order item:

1. **Download PDF** (existing) - Original PDF export, unchanged
2. **Print-Grade PDF (Beta)** (new) - High-quality print-ready PDF
3. **Quality Check** (new) - Diagnostic modal showing DPI and color space info

---

## Verification Steps

### 1. Verify Feature Flag is OFF by Default

```bash
# In .env:
ENABLE_PRINT_PIPELINE=false
VITE_ENABLE_PRINT_PIPELINE=false
```

**Expected behavior:**
- ✅ Site loads normally
- ✅ Existing "Download PDF" button works
- ❌ No "Print-Grade PDF (Beta)" button
- ❌ No "Quality Check" button

### 2. Enable Feature Flag

```bash
# In .env:
ENABLE_PRINT_PIPELINE=true
VITE_ENABLE_PRINT_PIPELINE=true
```

Restart dev server:
```bash
npm run dev
```

**Expected behavior:**
- ✅ Site loads normally
- ✅ Existing "Download PDF" button still works (unchanged)
- ✅ New "Print-Grade PDF (Beta)" button appears
- ✅ New "Quality Check" button appears

---

## File Structure

### New Files Created

```
.env.example                                    # Environment variable template
src/utils/cloudinaryPreview.ts                  # Preview URL builder
src/utils/cloudinaryPrint.ts                    # Print URL builder
src/utils/printPipeline.ts                      # Feature flag utilities
netlify/functions/lib/printDerivative.js        # AI print derivative helper
README-print-pipeline.md                        # This file
```

### Files to Modify (Manual Integration Required)

```
src/components/orders/OrderDetails.tsx          # Add print buttons (see MANUAL-INTEGRATION.md)
netlify/functions/ai-generate-banner.cjs        # Add print derivative generation (already done)
```

---

## Support

For questions or issues with the print pipeline:

1. Check this README
2. Review console logs (browser and Netlify Functions)
3. Verify environment variables are set correctly
4. Test with feature flag OFF to isolate issues

---

## License

This feature is part of the Final-Banner-Site project and follows the same license.
