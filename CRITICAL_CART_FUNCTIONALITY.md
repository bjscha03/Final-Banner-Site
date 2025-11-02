# 🚨 CRITICAL CART FUNCTIONALITY - DO NOT BREAK 🚨

## ⚠️ WARNING: READ THIS BEFORE MODIFYING CART CODE

This document explains the critical cart preservation flow that MUST continue working.
Breaking this flow results in lost sales and angry customers.

---

## 🎯 Critical User Flow That Must Work

### The Guest-to-Authenticated Cart Preservation Flow

1. **Guest user** visits site (not logged in)
2. **Guest adds items** to cart (1 or more banners)
3. **Guest goes to checkout** page
4. **Checkout prompts** "Sign In" or "Sign Up"
5. **Guest clicks** "Sign In" or "Sign Up"
6. **User authenticates** successfully
7. **User is redirected** back to checkout
8. ✅ **CART MUST STILL CONTAIN ALL ITEMS** ✅

---

## 🔧 How It Works (Technical Implementation)

### Key Components

#### 1. Session Cookie: `cart_session_id`
- **Cookie name**: `'cart_session_id'` (NOT `'guest_session_id'`)
- **⚠️ CRITICAL**: This exact cookie name is checked in multiple places

#### 2. Guest Cart Storage
- **Location**: Neon PostgreSQL database (`user_carts` table)
- **Saved by**: `netlify/functions/cart-save.cjs`
- **Loaded by**: `netlify/functions/cart-load.cjs`

#### 3. Checkout Context
- **Location**: `src/store/checkoutContext.ts`
- **Purpose**: Preserve guest session ID across authentication redirect

#### 4. Cart Sync Hook
- **Location**: `src/hooks/useCartSync.ts`
- **Purpose**: Detects login and triggers cart merge

#### 5. Cart Merge Function
- **Location**: `src/lib/cartSync.ts` → `mergeGuestCartOnLogin()`
- **Purpose**: Intelligently merge guest cart + user cart

---

## 🚫 THINGS YOU MUST NOT CHANGE

### 1. Cookie Name: `cart_session_id`
**⚠️ DO NOT**:
- Change the cookie name
- Use a different name like `'guest_session_id'`

### 2. Guest Session Detection Logic
**File**: `src/hooks/useCartSync.ts`
**⚠️ DO NOT**:
- Remove the `hasCookie` check
- Remove the `hasGuestSession` logic

### 3. Checkout Context Lifecycle
**⚠️ DO NOT**:
- Clear checkout context in SignIn.tsx before merge
- Remove the `setCheckoutContext()` call in Checkout.tsx

### 4. Cart Sync on Add to Cart
**File**: `src/store/cart.ts`
**⚠️ DO NOT**:
- Remove the `syncToServer()` call after adding items

---

## 🖼️ Thumbnail Rendering (Also Critical)

### Where Thumbnails Must Display
1. **Cart Page** (`src/pages/Cart.tsx`)
2. **Checkout Page** (`src/pages/Checkout.tsx`)
3. **Upsell Module** (`src/components/UpsellModule.tsx`)

### Component
**`src/components/BannerPreview.tsx`**

**⚠️ DO NOT**:
- Remove `file_url` or `web_preview_url` from cart items
- Remove `<BannerPreview>` components from cart/checkout pages

---

## ✅ Testing Checklist (Run Before Every Deploy)

### Quick Smoke Test (30 seconds)

1. Incognito browser → bannersonthefly.com
2. Add 1 item to cart
3. Go to checkout
4. Click "Sign In"
5. Sign in
6. ✅ Item still in cart? **PASS**
7. ❌ Cart empty? **FAIL - DO NOT DEPLOY**

### Console Logs to Watch For

**Good (cart preserved):**
```
🚨🚨�� MERGE PATH TRIGGERED - GUEST SESSION DETECTED 🚨🚨🚨
✅ MERGE: Guest cart merged successfully
```

**Bad (cart cleared):**
```
🚨🚨🚨 NO GUEST SESSION PATH - CART WILL BE CLEARED 🚨🚨🚨
```

---

## 🚀 Before Every Deploy

```bash
# Run health check
./scripts/check-cart-health.sh

# Run quick smoke test (see above)
```

---

## 📞 Emergency Rollback

If cart functionality breaks in production:

```bash
git revert <broken-commit-hash>
git push origin main
```

**Last known working commits:**
- `5658094` - Added obvious logging (2025-11-02)
- `98c0866` - Fixed cookie name mismatch (2025-11-02)

---

## 📝 Summary

**DO NOT modify cart code without:**
1. Reading this document
2. Understanding the full flow
3. Testing thoroughly
4. Running health check script

**When in doubt, ask before changing cart-related code!**
