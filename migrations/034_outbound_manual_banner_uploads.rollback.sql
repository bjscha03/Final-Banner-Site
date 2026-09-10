BEGIN;

UPDATE outbound_company_mockups
   SET quality_level='name_only',status='fallback',last_error_code='MANUAL_UPLOAD_MIGRATION_ROLLED_BACK'
 WHERE quality_level='manual_upload';

ALTER TABLE outbound_company_mockups
  DROP CONSTRAINT IF EXISTS outbound_company_mockups_quality_level_check;

ALTER TABLE outbound_company_mockups
  ADD CONSTRAINT outbound_company_mockups_quality_level_check
  CHECK (quality_level IN ('logo_and_product', 'logo', 'product', 'name_only'));

COMMIT;
