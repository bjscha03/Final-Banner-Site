# 🔍 Cart Sync Debugging Guide

## ✅ DEPLOYMENT STATUS

**Code deployed:** Commit `38a43f8` with comprehensive debugging  
**Netlify:** Deploying now (wait 2-3 minutes)  
**Database:** `user_carts` table created successfully in Neon  

---

## 📋 WHAT TO DO NOW

### Step 1: Open Browser Console

1. Open your site: https://bannersonthefly.com
2. Open Developer Tools (F12 or Cmd+Option+I)
3. Go to the **Console** tab
4. Clear the console (click the 🚫 icon)

### Step 2: Test Cross-Device Sync

**On Desktop:**
1. Log in with your Google account
2. Add 2 items to cart
3. Watch the console logs
4. Copy ALL console logs and send them to me

**On Mobile:**
1. Log in with the SAME Google account
2. Watch the console logs
3. Check if the 2 items from desktop appear
4. Copy ALL console logs and send them to me

---

## 🔍 WHAT THE CONSOLE LOGS WILL SHOW

### When You Log In:

You should see logs like this:

```
═══════════════════════════════════════════════
🔍 CART SYNC HOOK: User effect triggered
🔍 Previous user ID: null
🔍 Current user ID: abc-123-def-456
🔍 User object: {id: "abc-123-def-456", email: "you@gmail.com", ...}
🔍 User email: you@gmail.com
👤 User logged in, syncing cart from Neon...
👤 User ID: abc-123-def-456
👤 User email: you@gmail.com
👤 Setting cart owner in localStorage...
👤 About to call loadFromServer()...
═══════════════════════════════════════════════

🔵 STORE: loadFromServer called
🔵 STORE: Got user ID: abc-123-def-456
🔵 STORE: Getting local items...
🔵 STORE: Local items count: 0
🔵 STORE: Calling cartSync.mergeAndSyncCart...

🔄 MERGE START: mergeAndSyncCart called
🔄 MERGE: User ID: abc-123-def-456
🔄 MERGE: Local items count: 0
✅ MERGE: Database is available
🔄 MERGE: About to call loadCart...

🔄 LOAD START: loadCart called
🔄 LOAD: User ID: abc-123-def-456
✅ LOAD: Database is available
🔄 LOAD: About to execute SQL SELECT...
🔄 LOAD: SQL executed, result: [{cart_data: [...]}]
✅ LOAD: Found cart data, 2 items
✅ Loaded cart from Neon: 2 items

☁️  Server cart: 2 items
✅ Merged cart: 2 items

💾 SAVE START: saveCart called
💾 SAVE: User ID: abc-123-def-456
💾 SAVE: Items count: 2
✅ SAVE: Database is available, proceeding with save
💾 SAVE: About to execute SQL INSERT...
✅ SAVE: SQL executed successfully
✅ Cart saved to Neon

🔵 STORE: Merge complete, merged items count: 2
🔵 STORE: Setting merged items to store...
🔵 STORE: Store updated with merged items
```

### When You Add Items to Cart:

```
💾 SAVE START: saveCart called
💾 SAVE: User ID: abc-123-def-456
💾 SAVE: Items count: 3
💾 SAVE: Items: [{id: "...", name: "Banner 1"}, ...]
✅ SAVE: Database is available, proceeding with save
💾 SAVE: About to execute SQL INSERT...
✅ SAVE: SQL executed successfully
✅ SAVE: Verifying save by reading back...
✅ SAVE: Verification result: [{cart_data: [...]}]
✅ SAVE: Saved items count: 3
✅ Cart saved to Neon
```

---

## ❌ POSSIBLE ERRORS TO LOOK FOR

### Error 1: Database Not Available

```
❌ LOAD: Database not available, skipping cart load
❌ LOAD: db value: null
```

**This means:** The Neon database connection is not configured  
**Fix:** Check environment variables `VITE_DATABASE_URL` or `NETLIFY_DATABASE_URL`

### Error 2: User ID Mismatch

```
🔍 CART SYNC: Parsed user: {id: undefined, email: "you@gmail.com"}
❌ CART SYNC: Returning user ID: null
```

**This means:** The user object doesn't have an `id` field  
**Fix:** Check how Google OAuth stores user data in localStorage

### Error 3: SQL Error

```
❌ CART SYNC ERROR: Failed to save cart to Neon
❌ CART SYNC ERROR: Error details: relation "user_carts" does not exist
```

**This means:** The SQL migration wasn't run  
**Fix:** Run the migration in Neon console (you already did this)

### Error 4: Foreign Key Error

```
❌ CART SYNC ERROR: Error details: insert or update on table "user_carts" violates foreign key constraint
```

**This means:** The user_id doesn't exist in the `profiles` table  
**Fix:** The Google OAuth user needs to be in the `profiles` table first

---

## 🐛 DEBUGGING CHECKLIST

Send me the answers to these questions:

### Question 1: What user ID is being used?

Look for this log:
```
🔍 CART SYNC: Returning user ID: ???
```

**What is the user ID?** (e.g., `abc-123-def-456` or `null`)

### Question 2: Is the database available?

Look for this log:
```
✅ LOAD: Database is available
```

**Do you see this?** (Yes/No)

If you see:
```
❌ LOAD: Database not available
❌ LOAD: db value: null
```

**Then the database connection is broken.**

### Question 3: What happens when you add items?

After adding an item, look for:
```
💾 SAVE: About to execute SQL INSERT...
✅ SAVE: SQL executed successfully
```

**Do you see these logs?** (Yes/No)

### Question 4: What happens on mobile login?

When you log in on mobile, look for:
```
🔄 LOAD: SQL executed, result: ???
```

**What does the result show?** (Empty array `[]` or cart data?)

### Question 5: Are there any red errors?

**Do you see any red error messages in the console?** (Yes/No)

If yes, copy the ENTIRE error message.

---

## 📤 WHAT TO SEND ME

1. **Desktop console logs** (when you log in and add items)
2. **Mobile console logs** (when you log in)
3. **Answers to the 5 questions above**
4. **Any red error messages**

With this information, I can pinpoint exactly where the sync is failing and fix it!

---

## 🎯 EXPECTED BEHAVIOR

**If everything works correctly:**

1. Desktop: Log in → Add 2 items → See save logs
2. Mobile: Log in → See load logs → See 2 items in cart
3. Mobile: Add 1 more item → See save logs
4. Desktop: Refresh → See load logs → See all 3 items

**Current behavior (what you're experiencing):**

- Desktop: Items added successfully
- Mobile: Items NOT appearing (cart is empty)

The logs will tell us WHY this is happening!

