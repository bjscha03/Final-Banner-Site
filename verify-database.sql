-- Verify Phase 1 Database Setup

-- 1. Check abandoned_carts table
SELECT 
  'abandoned_carts' as table_name,
  COUNT(*) as row_count,
  MAX(created_at) as latest_entry
FROM abandoned_carts;

-- 2. Check discount_codes table
SELECT 
  'discount_codes' as table_name,
  COUNT(*) as row_count,
  MAX(created_at) as latest_entry
FROM discount_codes;

-- 3. View recent abandoned carts
SELECT 
  id,
  email,
  total_value,
  recovery_status,
  cart_contents::text as cart_preview,
  created_at
FROM abandoned_carts
ORDER BY created_at DESC
LIMIT 5;

-- 4. View recent discount codes
SELECT 
  code,
  discount_percentage,
  used,
  expires_at,
  created_at
FROM discount_codes
ORDER BY created_at DESC
LIMIT 5;
