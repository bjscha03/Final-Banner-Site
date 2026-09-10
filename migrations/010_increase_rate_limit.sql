-- Increase rate limit from 3 to 10 requests per 24 hours
-- This allows more testing and legitimate use cases

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
  
  -- Increased from 3 to 10 to allow more legitimate requests
  RETURN code_count < 10;
END;
$$ LANGUAGE plpgsql;
