# OrderDetails.tsx Integration Guide

## Overview

This guide provides **exact instructions** for integrating the Print Pipeline features into `src/components/orders/OrderDetails.tsx`.

**IMPORTANT**: Make these changes carefully. All additions are feature-flagged and will not affect existing functionality.

---

## Step 1: Add Imports

**Location**: After existing imports (around line 18)

**Add these 3 import lines**:

```typescript
import PDFQualityCheck from '../admin/PDFQualityCheck';
import { isPrintPipelineEnabled } from '../../utils/printPipeline';
import { Sparkles, Info } from 'lucide-react';
```

**Example** (what it should look like):

```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Download, X } from 'lucide-react';
import PDFQualityCheck from '../admin/PDFQualityCheck';  // ← ADD THIS
import { isPrintPipelineEnabled } from '../../utils/printPipeline';  // ← ADD THIS
import { Sparkles, Info } from 'lucide-react';  // ← ADD THIS
```

---

## Step 2: Add State Variables

**Location**: After `const isAdminUser = user && isAdmin(user);` (around line 38)

**Add these 3 lines**:

```typescript
const [qualityCheckOpen, setQualityCheckOpen] = useState(false);
const [qualityCheckData, setQualityCheckData] = useState<any>(null);
const printPipelineEnabled = isPrintPipelineEnabled();
```

**Example** (what it should look like):

```typescript
const isAdminUser = user && isAdmin(user);
const [qualityCheckOpen, setQualityCheckOpen] = useState(false);  // ← ADD THIS
const [qualityCheckData, setQualityCheckData] = useState<any>(null);  // ← ADD THIS
const printPipelineEnabled = isPrintPipelineEnabled();  // ← ADD THIS
```

---

## Step 3: Add Handler Functions

**Location**: After the `handlePdfDownload` function (around line 150)

**Add these 2 functions**:

```typescript
// Handler for print-grade PDF download (Beta)
const handlePrintGradePdfDownload = async (item: any, index: number) => {
  try {
    setPdfGenerating({ ...pdfGenerating, [index]: true });
    
    const response = await fetch('/.netlify/functions/render-print-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        fileKey: item.file_key,
        bannerWidthIn: item.width_in,
        bannerHeightIn: item.height_in,
        targetDpi: 150,
        bleedIn: 0.25,
        textElements: item.text_elements || [],
        applyColorCorrection: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to generate print-grade PDF');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `banner-${order.id}-item-${index + 1}-print-grade.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast({
      title: 'Print-Grade PDF Downloaded',
      description: 'High-quality print-ready PDF generated successfully.',
    });
  } catch (error) {
    console.error('Error generating print-grade PDF:', error);
    toast({
      title: 'Error',
      description: error instanceof Error ? error.message : 'Failed to generate print-grade PDF',
      variant: 'destructive',
    });
  } finally {
    setPdfGenerating({ ...pdfGenerating, [index]: false });
  }
};

// Handler for quality check modal
const handleQualityCheck = (item: any) => {
  setQualityCheckData({
    bannerWidthIn: item.width_in,
    bannerHeightIn: item.height_in,
    fileKey: item.file_key,
    logoKey: item.logo_key,
    aiImageKey: item.ai_image_key,
    targetDpi: 150,
  });
  setQualityCheckOpen(true);
};
```

---

## Step 4: Add UI Buttons

**Location**: After the existing "Download PDF" button (around line 385)

**Find this block**:

```typescript
{/* Admin PDF Download Button */}
{isAdminUser && (item.file_key || item.print_ready_url || item.web_preview_url) && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => handlePdfDownload(item, index)}
    disabled={pdfGenerating[index]}
    className="w-full"
  >
    <Download className="h-3 w-3 mr-1" />
    Download PDF
  </Button>
)}
```

**Add AFTER it**:

```typescript
{/* Print-Grade PDF Button (Beta) - Feature Flagged */}
{isAdminUser && printPipelineEnabled && (item.file_key || item.print_ready_url || item.web_preview_url) && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => handlePrintGradePdfDownload(item, index)}
    disabled={pdfGenerating[index]}
    className="w-full bg-gradient-to-r from-blue-50 to-purple-50 border-blue-300 hover:from-blue-100 hover:to-purple-100"
  >
    <Sparkles className="h-3 w-3 mr-1 text-blue-600" />
    Print-Grade PDF (Beta)
  </Button>
)}

{/* Quality Check Button - Feature Flagged */}
{isAdminUser && printPipelineEnabled && (item.file_key || item.print_ready_url || item.web_preview_url) && (
  <Button
    variant="ghost"
    size="sm"
    onClick={() => handleQualityCheck(item)}
    className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50"
  >
    <Info className="h-3 w-3 mr-1" />
    Quality Check
  </Button>
)}
```

---

## Step 5: Add Quality Check Modal

**Location**: Before the closing `</Dialog>` tag (around line 465)

**Find this**:

```typescript
    </Dialog>
  );
}

export default OrderDetails;
```

**Add the modal BEFORE `</Dialog>`**:

```typescript
    {/* Quality Check Modal */}
    {qualityCheckData && (
      <PDFQualityCheck
        isOpen={qualityCheckOpen}
        onClose={() => setQualityCheckOpen(false)}
        orderData={qualityCheckData}
      />
    )}

    </Dialog>
  );
}

export default OrderDetails;
```

---

## Verification

After making these changes, verify:

1. **No TypeScript errors**: Check your IDE for red squiggly lines
2. **Build succeeds**: Run `npm run build`
3. **Feature flag OFF**: With `VITE_ENABLE_PRINT_PIPELINE=false`, no new buttons appear
4. **Feature flag ON**: With `VITE_ENABLE_PRINT_PIPELINE=true`, new buttons appear for admins

---

## Complete Example

Here's what the key sections should look like after integration:

### Imports Section
```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Download, X } from 'lucide-react';
import PDFQualityCheck from '../admin/PDFQualityCheck';
import { isPrintPipelineEnabled } from '../../utils/printPipeline';
import { Sparkles, Info } from 'lucide-react';
```

### State Section
```typescript
const isAdminUser = user && isAdmin(user);
const [qualityCheckOpen, setQualityCheckOpen] = useState(false);
const [qualityCheckData, setQualityCheckData] = useState<any>(null);
const printPipelineEnabled = isPrintPipelineEnabled();
```

### Buttons Section
```typescript
{/* Admin PDF Download Button */}
{isAdminUser && (item.file_key || item.print_ready_url || item.web_preview_url) && (
  <Button variant="outline" size="sm" onClick={() => handlePdfDownload(item, index)} disabled={pdfGenerating[index]} className="w-full">
    <Download className="h-3 w-3 mr-1" />
    Download PDF
  </Button>
)}

{/* Print-Grade PDF Button (Beta) - Feature Flagged */}
{isAdminUser && printPipelineEnabled && (item.file_key || item.print_ready_url || item.web_preview_url) && (
  <Button variant="outline" size="sm" onClick={() => handlePrintGradePdfDownload(item, index)} disabled={pdfGenerating[index]} className="w-full bg-gradient-to-r from-blue-50 to-purple-50 border-blue-300 hover:from-blue-100 hover:to-purple-100">
    <Sparkles className="h-3 w-3 mr-1 text-blue-600" />
    Print-Grade PDF (Beta)
  </Button>
)}

{/* Quality Check Button - Feature Flagged */}
{isAdminUser && printPipelineEnabled && (item.file_key || item.print_ready_url || item.web_preview_url) && (
  <Button variant="ghost" size="sm" onClick={() => handleQualityCheck(item)} className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50">
    <Info className="h-3 w-3 mr-1" />
    Quality Check
  </Button>
)}
```

---

## Troubleshooting

### "Cannot find module '@/components/admin/PDFQualityCheck'"
- Make sure `src/components/admin/PDFQualityCheck.tsx` exists
- Check the import path is correct

### "Cannot find module '@/utils/printPipeline'"
- Make sure `src/utils/printPipeline.ts` exists
- Check the import path is correct

### Buttons not appearing
- Check `VITE_ENABLE_PRINT_PIPELINE=true` in `.env`
- Restart dev server after changing `.env`
- Check you're logged in as an admin user

### TypeScript errors
- Make sure all imports are correct
- Check for duplicate declarations
- Run `npm run build` to see detailed errors

---

## Summary

**Total Changes**:
- 3 import lines
- 3 state variables
- 2 handler functions
- 2 UI buttons
- 1 modal component

**Estimated Time**: 10-15 minutes

**Risk Level**: Low (all changes are additive and feature-flagged)

---

## Need Help?

If you encounter any issues during integration, check:
1. This guide for exact code snippets
2. `README-print-pipeline.md` for feature documentation
3. Console logs for runtime errors
4. TypeScript errors in your IDE
