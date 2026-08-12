-- Restore the explicit-opt-in-only review constraint.
-- Stop instead of rewriting any email that was already sent through admin authorization.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM outbound_manual_lead_reviews
    WHERE permission_status = 'admin_authorized' AND send_state = 'sent'
  ) THEN
    RAISE EXCEPTION 'Cannot roll back migration 030 after an admin-authorized email has been sent';
  END IF;
END $$;

UPDATE outbound_manual_lead_reviews
   SET review_status = 'pending', permission_status = 'unknown', permission_evidence = NULL,
       reviewed_by = NULL, reviewed_at = NULL, updated_at = NOW()
 WHERE permission_status = 'admin_authorized';

ALTER TABLE outbound_manual_lead_reviews
  DROP CONSTRAINT IF EXISTS outbound_manual_lead_reviews_authorization_check,
  DROP CONSTRAINT IF EXISTS outbound_manual_lead_reviews_permission_status_check;

ALTER TABLE outbound_manual_lead_reviews
  ADD CONSTRAINT outbound_manual_lead_reviews_permission_status_check
    CHECK (permission_status IN ('unknown', 'explicit_opt_in')),
  ADD CONSTRAINT outbound_manual_lead_reviews_check
    CHECK (
      review_status <> 'approved'
      OR (
        permission_status = 'explicit_opt_in'
        AND LENGTH(TRIM(COALESCE(permission_evidence, ''))) BETWEEN 8 AND 1000
        AND reviewed_at IS NOT NULL
        AND LENGTH(TRIM(COALESCE(reviewed_by, ''))) BETWEEN 3 AND 320
      )
    );

COMMIT;
