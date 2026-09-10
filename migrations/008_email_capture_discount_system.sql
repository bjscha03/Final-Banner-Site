-- Migration: Email Capture Discount System
-- Replaces inline code display with email-capture flow
-- Supports unique single-use codes per email with rate limiting

-- Create email_captures table for tracking email submissions
CREATE TABLE IF NOT EXISTS email_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  consent BOOLEAN NOT NULL DEFAULT TRUE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL CHECK (source IN ('first_visit', 'exit_intent')),
  ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_email_captures_email ON email_captures(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_email_captures_captured_at ON email_captures(captured_at);
CREATE INDEX IF NOT EXISTS idx_email_captures_ip ON email_captures(ip);

-- Update discount_codes table for new email-capture flow
ALTER TABLE discount_codes 
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'expired')),
ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS issued_ip INET,
ADD COLUMN IF NOT EXISTS user_agent TEXT,
ADD COLUMN IF NOT EXISTS campaign TEXT DEFAULT 'popup_first_visit';

-- Index for email-based lookups (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_discount_codes_email_lower ON discount_codes(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_discount_codes_status ON discount_codes(status);
CREATE INDEX IF NOT EXISTS idx_discount_codes_issued_at ON discount_codes(issued_at);
CREATE INDEX IF NOT EXISTS idx_discount_codes_campaign ON discount_codes(campaign);

-- Migrate existing used_by_user_id from TEXT[] to UUID if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discount_codes' 
    AND column_name = 'used_by_user_id'
    AND data_type = 'ARRAY'
  ) THEN
    ALTER TABLE discount_codes DROP COLUMN IF EXISTS used_by_user_id;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discount_codes' 
    AND column_name = 'used_by_user_id'
  ) THEN
    ALTER TABLE discount_codes ADD COLUMN used_by_user_id UUID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_discount_codes_used_by_user_id ON discount_codes(used_by_user_id);

-- Function to check rate limits (max 3 codes per IP per day)
CREATE OR REPLACE FUNCTION check_ip_rate_limit(check_ip INET)
RETURNS BOOLEAN AS $$
DECLARE
  code_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO code_count
  FROM discount_codes
  WHERE issued_ip = check_ip
    AND issued_at > NOW() - INTERVAL '24 hours'
    AND campaign LIKE 'popup_%';
  
  RETURN code_count < 3;
END;
$$ LANGUAGE plpgsql;

-- Function to get or create discount code for email
CREATE OR REPLACE FUNCTION get_or_create_discount_code(
  p_email TEXT,
  p_ip INET,
  p_user_agent TEXT,
  p_campaign TEXT DEFAULT 'popup_first_visit'
)
RETURNS TABLE (
  code TEXT,
  discount_percentage INTEGER,
  expires_at TIMESTAMPTZ,
  is_new BOOLEAN
) AS $$
DECLARE
  v_code TEXT;
  v_discount_percentage INTEGER := 20;
  v_expires_at TIMESTAMPTZ;
  v_existing_code RECORD;
  v_random_suffix TEXT;
BEGIN
  p_email := LOWER(TRIM(p_email));
  
  SELECT dc.code, dc.discount_percentage, dc.expires_at
  INTO v_existing_code
  FROM discount_codes dc
  WHERE LOWER(dc.email) = p_email
    AND dc.status = 'unused'
    AND dc.issued_at > NOW() - INTERVAL '24 hours'
    AND dc.campaign = p_campaign
  ORDER BY dc.issued_at DESC
  LIMIT 1;
  
  IF FOUND THEN
    RETURN QUERY SELECT 
      v_existing_code.code,
      v_existing_code.discount_percentage,
      v_existing_code.expires_at,
      FALSE;
    RETURN;
  END IF;
  
  LOOP
    v_random_suffix := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
    v_code := 'WELCOME20-' || v_random_suffix;
    
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM discount_codes WHERE code = v_code
    );
  END LOOP;
  
  v_expires_at := NOW() + INTERVAL '14 days';
  
  INSERT INTO discount_codes (
    code, email, discount_percentage, status, issued_at, expires_at,
    issued_ip, user_agent, campaign, single_use, max_uses_per_customer,
    created_at, updated_at
  ) VALUES (
    v_code, p_email, v_discount_percentage, 'unused', NOW(), v_expires_at,
    p_ip, p_user_agent, p_campaign, TRUE, 1, NOW(), NOW()
  );
  
  RETURN QUERY SELECT v_code, v_discount_percentage, v_expires_at, TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to mark code as used
CREATE OR REPLACE FUNCTION mark_discount_code_used(
  p_code TEXT,
  p_email TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  p_code := UPPER(TRIM(p_code));
  p_email := LOWER(TRIM(p_email));
  
  UPDATE discount_codes
  SET 
    status = 'used',
    used_at = NOW(),
    used_by_user_id = COALESCE(p_user_id, used_by_user_id),
    used_by_email = ARRAY_APPEND(COALESCE(used_by_email, ARRAY[]::TEXT[]), p_email),
    updated_at = NOW()
  WHERE code = p_code
    AND status = 'unused'
    AND LOWER(email) = p_email
    AND expires_at > NOW();
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to expire old codes
CREATE OR REPLACE FUNCTION expire_old_discount_codes()
RETURNS INTEGER AS $$
DECLARE
  v_expired INTEGER;
BEGIN
  UPDATE discount_codes
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'unused' AND expires_at < NOW();
  
  GET DIAGNOSTICS v_expired = ROW_COUNT;
  RETURN v_expired;
END;
$$ LANGUAGE plpgsql;
