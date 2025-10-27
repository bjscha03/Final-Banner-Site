-- Fix ambiguous column reference in get_or_create_discount_code function
-- The RETURN QUERY SELECT was using unqualified column names

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
  
  -- Check for existing unused code from last 24 hours
  SELECT dc.code, dc.discount_percentage, dc.expires_at
  INTO v_existing_code
  FROM discount_codes dc
  WHERE LOWER(dc.email) = p_email
    AND dc.status = 'unused'
    AND dc.issued_at > NOW() - INTERVAL '24 hours'
    AND dc.campaign = p_campaign
  ORDER BY dc.issued_at DESC
  LIMIT 1;
  
  -- Return existing code if found
  IF FOUND THEN
    RETURN QUERY SELECT 
      v_existing_code.code::TEXT,
      v_existing_code.discount_percentage::INTEGER,
      v_existing_code.expires_at::TIMESTAMPTZ,
      FALSE::BOOLEAN;
    RETURN;
  END IF;
  
  -- Generate new unique code
  LOOP
    v_random_suffix := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
    v_code := 'WELCOME20-' || v_random_suffix;
    
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM discount_codes WHERE discount_codes.code = v_code
    );
  END LOOP;
  
  v_expires_at := NOW() + INTERVAL '14 days';
  
  -- Insert new code
  INSERT INTO discount_codes (
    code, email, discount_percentage, status, issued_at, expires_at,
    issued_ip, user_agent, campaign, single_use, max_uses_per_customer,
    created_at, updated_at
  ) VALUES (
    v_code, p_email, v_discount_percentage, 'unused', NOW(), v_expires_at,
    p_ip, p_user_agent, p_campaign, TRUE, 1, NOW(), NOW()
  );
  
  -- Return new code
  RETURN QUERY SELECT 
    v_code::TEXT,
    v_discount_percentage::INTEGER,
    v_expires_at::TIMESTAMPTZ,
    TRUE::BOOLEAN;
END;
$$ LANGUAGE plpgsql;
