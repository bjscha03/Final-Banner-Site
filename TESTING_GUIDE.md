# Testing Guide - Preview Reset & Button Text Fixes

## Commit: 86bad5a

This deployment fixes three critical issues related to design area reset and button labeling.

---

## 🧪 Test Scenarios

### Test 1: Direct "Add to Cart" (No Upsell Modal)

**Setup:**
1. Select all extras: Grommets (any option), Nylon Rope, and Pole Pockets
2. Upload an image to the design area

**Steps:**
1. Click "Add to Cart" button
2. Since all extras are already selected, the upsell modal should NOT appear
3. Item should be added directly to cart

**Expected Results:**
✅ Toast notification: "Added to Cart"
✅ **Design area clears completely** (image disappears)
✅ All design fields reset to defaults
✅ Console shows: `🔄 RESET: About to call resetDesign() after direct add (no upsell)`

---

### Test 2: "Add to Cart" via Upsell Modal

**Setup:**
1. Do NOT select any extras (no grommets, rope, or pole pockets)
2. Upload an image to the design area

**Steps:**
1. Click "Add to Cart" button
2. Upsell modal appears: "Complete Your Banner"
3. Click "Add to Cart" in the modal (or "No thanks, continue without")

**Expected Results:**
✅ Toast notification: "Added to Cart"
✅ **Design area clears completely** (image disappears)
✅ All design fields reset to defaults
✅ Console shows: `�� RESET: About to call resetDesign() after add (from upsell modal)`

---

### Test 3: Update Cart Item (Direct, No Upsell)

**Setup:**
1. Add an item to cart first
2. Click "Edit" button next to the cart item
3. Design area loads with the item's data
4. Make sure all extras are selected (grommets, rope, pole pockets)
5. Make a change (e.g., change dimensions or upload different image)

**Steps:**
1. Click "Update Cart Item" button
2. Since all extras are already selected, the upsell modal should NOT appear
3. Item should be updated directly in cart

**Expected Results:**
✅ Toast notification: "Cart Updated"
✅ **Design area clears completely** (image disappears)
✅ All design fields reset to defaults
✅ **Button changes from "Update Cart Item" back to "Add to Cart"** (exits edit mode)
✅ Console shows: `🔄 RESET: About to call resetDesign() after direct update (no upsell)`

---

### Test 4: Update Cart Item (Via Upsell Modal)

**Setup:**
1. Add an item to cart with NO extras
2. Click "Edit" button next to the cart item
3. Design area loads with the item's data
4. Make a change (e.g., change dimensions)

**Steps:**
1. Click "Update Cart Item" button
2. Upsell modal appears: "Complete Your Banner"
3. **VERIFY: Button in modal says "Update Cart Item" (NOT "Add to Cart" or "Buy Now")**
4. Click "Update Cart Item" in the modal

**Expected Results:**
✅ Toast notification: "Cart Updated"
✅ **Design area clears completely** (image disappears)
✅ All design fields reset to defaults
✅ **Button changes from "Update Cart Item" back to "Add to Cart"** (exits edit mode)
✅ **Modal button showed "Update Cart Item" text** (not "Add to Cart")
✅ Console shows: `🔄 RESET: About to call resetDesign() after update (from upsell modal)`

---

### Test 5: Direct Checkout (No Upsell)

**Setup:**
1. Select all extras (grommets, rope, pole pockets)
2. Upload an image

**Steps:**
1. Click "Buy Now" button
2. Should navigate directly to checkout (no upsell modal)

**Expected Results:**
✅ Navigates to /checkout page
✅ **Design area clears before navigation**
✅ Console shows: `🔄 RESET: About to call resetDesign() after direct checkout (no upsell)`

---

### Test 6: Checkout via Upsell Modal

**Setup:**
1. Do NOT select any extras
2. Upload an image

**Steps:**
1. Click "Buy Now" button
2. Upsell modal appears
3. Click "Buy Now" in the modal

**Expected Results:**
✅ Navigates to /checkout page
✅ **Design area clears before navigation**
✅ Console shows: `🔄 RESET: About to call resetDesign() after checkout (from upsell modal)`

---

## 🔍 Console Logs to Look For

After each action, you should see these logs in the browser console:

```
🔄 RESET: About to call resetDesign() after [action type]
🔄 RESET: Current file before reset: {url: "...", ...}
🔄 QUOTE STORE: resetDesign() called
🔄 RESET: resetDesign() called
🔄 RESET: Current file after reset: undefined
🔄 PREVIEW USEEFFECT: File is undefined, resetting image state
🔄 PREVIEW USEEFFECT: Image state reset complete
```

---

## ✅ Success Criteria

All 6 test scenarios should pass with:
1. Design area clearing properly (image disappears)
2. All fields resetting to defaults
3. Correct button text in upsell modal when editing ("Update Cart Item")
4. Proper console logs appearing
5. No errors in console

---

## 🐛 If Issues Occur

If the design area doesn't clear:
1. Check browser console for the 🔄 RESET logs
2. If logs are missing, the resetDesign() call isn't executing
3. If logs appear but image doesn't clear, there's an issue in the PreviewCanvas component

If button text is wrong in upsell modal:
1. Check that the modal receives `actionType='update'` when editing
2. Verify the actionText logic in UpsellModal.tsx

---

## 📝 Notes

- The fix adds `resetDesign()` calls to **all 6 cart action paths**:
  1. Direct add (no upsell)
  2. Add via upsell modal
  3. Direct update (no upsell)
  4. Update via upsell modal
  5. Direct checkout (no upsell)
  6. Checkout via upsell modal

- The upsell modal now properly shows "Update Cart Item" when editing instead of "Add to Cart"

- All changes include extensive console logging for debugging

