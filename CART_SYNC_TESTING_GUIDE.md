# 🧪 Cart Sync Testing Guide

## ✅ FIXES DEPLOYED

**Commit:** `e364c16`  
**Deployment:** Netlify (wait 2-3 minutes)  

### What Was Fixed:

**Issue #1: Cart clearing on logout** ✅ FIXED
- **Problem:** Cart was being cleared when user logged out
- **Fix:** Removed `clearCart()` call on logout
- **Now:** Cart persists in localStorage and merges with server on next login

**Issue #2: Cross-device sync**
- **Status:** Investigating with comprehensive debugging
- **Verified:** `syncToServer()` IS being called after adding items
- **Next:** Need to see console logs to identify why sync isn't working

---

## 🧪 TESTING STEPS

### Test 1: Cart Persists on Logout/Login

**Desktop:**
1. Clear browser cache and localStorage
2. Log in with your Google account
3. Add 2 items to cart
4. **Check console** - you should see:
   ```
   💾 SAVE START: saveCart called
   💾 SAVE: User ID: your-user-id
   ✅ SAVE: Database is available, proceeding with save
   ✅ SAVE: SQL executed successfully
   ✅ Cart saved to Neon
   ```
5. Log out
6. **Check console** - you should see:
   ```
   🚪 User logged out
   🚪 Cart will remain in localStorage for next login
   ```
7. **Check cart** - items should STILL be visible (not cleared)
8. Log back in with the SAME account
9. **Check console** - you should see:
   ```
   👤 User logged in, syncing cart from Neon...
   🔵 STORE: loadFromServer called
   🔄 MERGE: Merging local cart with server cart...
   ✅ Merged cart: 2 items
   ```
10. **Check cart** - should still see 2 items

✅ **PASS:** Cart persists through logout/login  
❌ **FAIL:** Cart is empty after logging back in

---

### Test 2: Cross-Device Sync

**Desktop:**
1. Log in with your Google account
2. Add 2 items to cart
3. **Copy the console logs** showing the save process
4. **Note your user ID** from the logs

**Mobile:**
1. Log in with the SAME Google account
2. **Check console immediately** - you should see:
   ```
   👤 User logged in, syncing cart from Neon...
   🔵 STORE: loadFromServer called
   🔍 CART SYNC: Returning user ID: your-user-id
   🔄 LOAD START: loadCart called
   🔄 LOAD: User ID: your-user-id
   ✅ LOAD: Database is available
   🔄 LOAD: About to execute SQL SELECT...
   🔄 LOAD: SQL executed, result: [...]
   ✅ LOAD: Found cart data, 2 items
   ✅ Merged cart: 2 items
   ```
3. **Check cart** - should see the 2 items from desktop

✅ **PASS:** Cart syncs from desktop to mobile  
❌ **FAIL:** Cart is empty on mobile

---

## 🔍 WHAT TO LOOK FOR IN CONSOLE LOGS

### When Adding Items (Desktop):

**GOOD - Sync is working:**
```
💾 SAVE START: saveCart called
💾 SAVE: User ID: abc-123-def-456
💾 SAVE: Items count: 2
✅ SAVE: Database is available, proceeding with save
💾 SAVE: About to execute SQL INSERT...
✅ SAVE: SQL executed successfully
✅ SAVE: Verifying save by reading back...
✅ SAVE: Saved items count: 2
✅ Cart saved to Neon
```

**BAD - Database not available:**
```
❌ SAVE: Database not available, skipping cart save
❌ SAVE: db value: null
```

**BAD - User ID missing:**
```
🔍 CART SYNC: Returning user ID: null
❌ STORE: No user logged in, skipping server sync
```

### When Logging In (Mobile):

**GOOD - Loading from server:**
```
🔄 LOAD START: loadCart called
🔄 LOAD: User ID: abc-123-def-456
✅ LOAD: Database is available
🔄 LOAD: SQL executed, result: [{cart_data: [...]}]
✅ LOAD: Found cart data, 2 items
```

**BAD - No data in database:**
```
🔄 LOAD: SQL executed, result: []
📭 LOAD: No cart found in Neon for this user
```

**BAD - Database error:**
```
❌ CART SYNC ERROR: Failed to load cart from Neon
❌ CART SYNC ERROR: Error details: [error message]
```

---

## 📤 WHAT TO SEND ME

If cross-device sync is STILL not working, send me:

### From Desktop:
1. **Full console logs** when you add items (should show save process)
2. **User ID** from the logs
3. **Any red errors**

### From Mobile:
1. **Full console logs** when you log in (should show load process)
2. **User ID** from the logs
3. **SQL result** from the load query
4. **Any red errors**

### Specific Questions:
1. **Does the user ID match** between desktop and mobile?
2. **Is the database available** on both devices?
3. **Does the save succeed** on desktop?
4. **Does the load find data** on mobile?

---

## 🐛 POSSIBLE ISSUES

### Issue A: User ID Mismatch
**Symptom:** Desktop user ID ≠ Mobile user ID  
**Cause:** Google OAuth creating different user IDs  
**Fix:** Need to check how user IDs are stored in `profiles` table

### Issue B: Database Not Available
**Symptom:** `❌ SAVE: db value: null`  
**Cause:** Neon database connection not configured  
**Fix:** Check environment variables

### Issue C: Foreign Key Constraint
**Symptom:** `violates foreign key constraint "user_carts_user_id_fkey"`  
**Cause:** User ID doesn't exist in `profiles` table  
**Fix:** User needs to be created in profiles table first

### Issue D: Save Succeeds But Load Fails
**Symptom:** Save logs look good, but load returns empty  
**Cause:** Possible user ID mismatch or database query issue  
**Fix:** Need to see both user IDs to compare

---

## ✅ EXPECTED BEHAVIOR

**Correct Flow:**
1. Desktop: Add items → `syncToServer()` → Save to Neon ✅
2. Desktop: Log out → Cart stays in localStorage ✅
3. Desktop: Log back in → Merge localStorage + Neon ✅
4. Mobile: Log in → Load from Neon → See desktop items ✅

**Current Status:**
- ✅ Cart persists on logout (FIXED)
- ❓ Cross-device sync (TESTING NEEDED)

---

Test and send me the console logs! 🚀
