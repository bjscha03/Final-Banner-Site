-- Roll back Phase 2 discovery and deterministic qualification.
-- Run migration 022's rollback before migration 021's rollback.
-- No CASCADE is used; unexpected dependencies stop the rollback safely.

BEGIN;

DROP INDEX IF EXISTS outbound_provider_usage_request_uidx;
DROP INDEX IF EXISTS outbound_prospect_sources_prospect_idx;
DROP INDEX IF EXISTS outbound_contacts_prospect_quality_idx;
DROP INDEX IF EXISTS outbound_prospects_shadow_queue_idx;

DROP TABLE IF EXISTS outbound_prospect_sources;

ALTER TABLE outbound_provider_usage
  DROP COLUMN IF EXISTS usage_metadata,
  DROP COLUMN IF EXISTS rate_limit_reset_at,
  DROP COLUMN IF EXISTS rate_limit_remaining,
  DROP COLUMN IF EXISTS provider_credits,
  DROP COLUMN IF EXISTS request_key;

ALTER TABLE outbound_research_snapshots
  DROP COLUMN IF EXISTS page_manifest,
  DROP COLUMN IF EXISTS cache_status,
  DROP COLUMN IF EXISTS extraction_version,
  DROP COLUMN IF EXISTS http_last_modified,
  DROP COLUMN IF EXISTS http_etag,
  DROP COLUMN IF EXISTS content_bytes,
  DROP COLUMN IF EXISTS content_type,
  DROP COLUMN IF EXISTS http_status,
  DROP COLUMN IF EXISTS final_url;

ALTER TABLE outbound_contacts
  DROP COLUMN IF EXISTS send_eligible,
  DROP COLUMN IF EXISTS mx_checked_at,
  DROP COLUMN IF EXISTS mx_status,
  DROP COLUMN IF EXISTS last_seen_at,
  DROP COLUMN IF EXISTS active,
  DROP COLUMN IF EXISTS domain_matches,
  DROP COLUMN IF EXISTS is_free_mailbox,
  DROP COLUMN IF EXISTS is_role_address,
  DROP COLUMN IF EXISTS syntax_valid,
  DROP COLUMN IF EXISTS source_url;

ALTER TABLE outbound_prospects
  DROP COLUMN IF EXISTS last_qualified_at,
  DROP COLUMN IF EXISTS exclusion_codes,
  DROP COLUMN IF EXISTS qualification_version,
  DROP COLUMN IF EXISTS contact_state,
  DROP COLUMN IF EXISTS research_state;

DELETE FROM outbound_provider_configs
 WHERE provider_id = 'apollo'
   AND enabled = FALSE
   AND settings_version = 1
   AND display_name = 'Apollo Organization Search';

COMMIT;
