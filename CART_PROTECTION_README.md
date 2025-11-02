# 🛡️ Cart Functionality Protection System

## Problem

Cart functionality (guest cart preservation and thumbnails) has been breaking every few days, causing lost sales and customer frustration.

## Solution

This protection system ensures cart functionality stays working:

---

## 📚 Files Created

### 1. `CRITICAL_CART_FUNCTIONALITY.md`
**Comprehensive documentation** explaining:
- How cart preservation works
- What code must NOT be changed
- Common breakage causes
- Emergency debugging steps
- Thumbnail rendering requirements

**Read this before modifying any cart-related code!**

### 2. `tests/cart-preservation.test.md`
**Manual test suite** with:
- 10 comprehensive test scenarios
- 30-second quick smoke test
- Console log validation
- Regression test guidelines

**Run these tests before every deploy!**

### 3. `scripts/check-cart-health.sh`
**Automated health check** that verifies:
- Cookie name consistency (`cart_session_id`)
- Merge function exists
- TypeScript compiles without errors
- Critical files are intact

**Run this script before every deploy!**

---

## 🚀 Usage

### Before Every Deploy

```bash
# 1. Run automated health check
./scripts/check-cart-health.sh

# 2. Run quick smoke test (30 seconds)
# - Open incognito browser
# - Add item to cart
# - Go to checkout
# - Click "Sign In"
# - Sign in
# - Verify cart still has items ✅
```

### Before Modifying Cart Code

```bash
# 1. Read the documentation
cat CRITICAL_CART_FUNCTIONALITY.md

# 2. Understand what NOT to change
# 3. Make your changes
# 4. Run health check
./scripts/check-cart-health.sh

# 5. Run full test suite
# See tests/cart-preservation.test.md
```

---

## ⚠️ Critical Files (DO NOT BREAK)

These files contain critical cart logic:

- `src/hooks/useCartSync.ts` - Cart merge trigger
- `src/lib/cartSync.ts` - Cart merge logic
- `src/store/cart.ts` - Cart state management
- `src/store/checkoutContext.ts` - Checkout context
- `src/pages/Checkout.tsx` - Checkout flow
- `src/pages/SignIn.tsx` - Sign-in flow
- `netlify/functions/cart-save.cjs` - Save cart to DB
- `netlify/functions/cart-load.cjs` - Load cart from DB
- `src/components/BannerPreview.tsx` - Thumbnail rendering

---

## 🔍 Quick Reference

### Cookie Name
**MUST BE**: `cart_session_id`
**NOT**: `guest_session_id`

### Console Logs (Good)
```
🚨🚨🚨 MERGE PATH TRIGGERED - GUEST SESSION DETECTED 🚨🚨🚨
✅ MERGE: Guest cart merged successfully
```

### Console Logs (Bad)
```
🚨🚨🚨 NO GUEST SESSION PATH - CART WILL BE CLEARED 🚨🚨🚨
```

---

## 📞 Emergency

If cart breaks in production:

```bash
# Rollback to last working commit
git revert <broken-commit-hash>
git push origin main

# Last known working commits:
# - 5658094 (2025-11-02)
# - 98c0866 (2025-11-02)
```

---

## 📝 Summary

**Three simple rules:**

1. **Read** `CRITICAL_CART_FUNCTIONALITY.md` before changing cart code
2. **Run** `./scripts/check-cart-health.sh` before every deploy
3. **Test** manually in incognito browser before every deploy

**Follow these rules = Cart stays working = Happy customers = More sales!**
