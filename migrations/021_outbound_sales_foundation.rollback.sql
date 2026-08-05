-- Roll back Phase 1 of the isolated outbound sales foundation.
--
-- Safety properties:
--   * every target is an outbound_* object created by migration 021;
--   * CASCADE is intentionally not used, so unexpected dependencies stop the
--     rollback instead of removing unrelated objects;
--   * the entire rollback is transactional.
--
-- This rollback destroys outbound-only data. Run it only on an isolated
-- preview/staging branch, or during an approved production rollback before the
-- outbound subsystem contains data that must be retained.

BEGIN;

DROP TRIGGER IF EXISTS outbound_prospect_status_audit_trigger ON outbound_prospects;
DROP TRIGGER IF EXISTS outbound_opportunity_status_audit_trigger ON outbound_opportunities;
DROP TRIGGER IF EXISTS outbound_audit_log_immutable_trigger ON outbound_audit_log;

DROP FUNCTION IF EXISTS outbound_record_prospect_status_change();
DROP FUNCTION IF EXISTS outbound_record_opportunity_status_change();
DROP FUNCTION IF EXISTS outbound_reject_audit_mutation();

DROP TABLE IF EXISTS outbound_ai_usage;
DROP TABLE IF EXISTS outbound_provider_usage;
DROP TABLE IF EXISTS outbound_email_events;
DROP TABLE IF EXISTS outbound_replies;
DROP TABLE IF EXISTS outbound_order_attributions;
DROP TABLE IF EXISTS outbound_opportunities;
DROP TABLE IF EXISTS outbound_messages;
DROP TABLE IF EXISTS outbound_campaign_variants;
DROP TABLE IF EXISTS outbound_research_snapshots;
DROP TABLE IF EXISTS outbound_contacts;
DROP TABLE IF EXISTS outbound_jobs;
DROP TABLE IF EXISTS outbound_cost_ledger;
DROP TABLE IF EXISTS outbound_suppressions;
DROP TABLE IF EXISTS outbound_prospects;
DROP TABLE IF EXISTS outbound_campaigns;
DROP TABLE IF EXISTS outbound_provider_configs;
DROP TABLE IF EXISTS outbound_settings;
DROP TABLE IF EXISTS outbound_audit_log;

COMMIT;
