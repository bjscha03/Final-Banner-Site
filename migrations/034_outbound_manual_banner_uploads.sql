-- Replace automated company-banner generation with administrator-reviewed uploads.
-- Raster bytes remain in Netlify Blobs; this migration only adds the explicit
-- manual-upload quality state used by the review and send contracts.

BEGIN;

ALTER TABLE outbound_company_mockups
  DROP CONSTRAINT IF EXISTS outbound_company_mockups_quality_level_check;

ALTER TABLE outbound_company_mockups
  ADD CONSTRAINT outbound_company_mockups_quality_level_check
  CHECK (quality_level IN ('logo_and_product', 'logo', 'product', 'name_only', 'manual_upload'));

COMMENT ON COLUMN outbound_company_mockups.quality_level IS
  'Records the artwork source/quality state. manual_upload is an authenticated administrator-reviewed image; legacy generated states remain readable but are not eligible for the manual-upload send flow.';

COMMIT;
