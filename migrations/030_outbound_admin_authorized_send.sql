-- Make the authenticated Send click the single admin authorization step.
-- Existing explicit-opt-in records remain valid and all delivery safeguards stay in place.

BEGIN;

ALTER TABLE outbound_manual_lead_reviews
  DROP CONSTRAINT IF EXISTS outbound_manual_lead_reviews_permission_status_check,
  DROP CONSTRAINT IF EXISTS outbound_manual_lead_reviews_check,
  DROP CONSTRAINT IF EXISTS outbound_manual_lead_reviews_authorization_check;

ALTER TABLE outbound_manual_lead_reviews
  ADD CONSTRAINT outbound_manual_lead_reviews_permission_status_check
    CHECK (permission_status IN ('unknown', 'explicit_opt_in', 'admin_authorized')),
  ADD CONSTRAINT outbound_manual_lead_reviews_authorization_check
    CHECK (
      review_status <> 'approved'
      OR (
        permission_status IN ('explicit_opt_in', 'admin_authorized')
        AND reviewed_at IS NOT NULL
        AND LENGTH(TRIM(COALESCE(reviewed_by, ''))) BETWEEN 3 AND 320
        AND (
          permission_status <> 'explicit_opt_in'
          OR LENGTH(TRIM(COALESCE(permission_evidence, ''))) BETWEEN 8 AND 1000
        )
      )
    );

COMMIT;
