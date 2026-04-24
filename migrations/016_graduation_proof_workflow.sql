-- 016_graduation_proof_workflow.sql
--
-- Extends designer_intake_orders with pricing/payment metadata required for the
-- full graduation designer-assisted workflow, and introduces two new tables:
--   - proof_versions       : every proof an admin uploads for an intake
--   - revision_requests    : every revision a customer asks for on a proof
--
-- All DDL is idempotent so the runtime ensureSchema() in lib/graduation.cjs
-- can re-apply it safely on cold starts.

-- --- Columns on designer_intake_orders -------------------------------------
ALTER TABLE designer_intake_orders
  ADD COLUMN IF NOT EXISTS estimated_product_subtotal_cents INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_tax_cents              INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_product_total_cents    INTEGER,
  ADD COLUMN IF NOT EXISTS design_fee_paid_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_payment_paid_at            TIMESTAMPTZ,
  -- PayPal order id of the final-balance capture (used for idempotency
  -- and to correlate webhook events to the intake).
  ADD COLUMN IF NOT EXISTS final_product_paypal_order_id    TEXT,
  ADD COLUMN IF NOT EXISTS latest_proof_version             INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_status_change_at            TIMESTAMPTZ;

-- --- proof_versions --------------------------------------------------------
CREATE TABLE IF NOT EXISTS proof_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id       UUID NOT NULL REFERENCES designer_intake_orders(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  proof_file_url  TEXT NOT NULL,
  proof_file_key  TEXT,
  proof_file_name TEXT,
  admin_message   TEXT,
  admin_email     VARCHAR(255),
  status          VARCHAR(40) NOT NULL DEFAULT 'sent',  -- sent | revision_requested | approved | superseded
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (intake_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_proof_versions_intake ON proof_versions (intake_id);
CREATE INDEX IF NOT EXISTS idx_proof_versions_status ON proof_versions (status);

-- --- revision_requests -----------------------------------------------------
CREATE TABLE IF NOT EXISTS revision_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id         UUID NOT NULL REFERENCES designer_intake_orders(id) ON DELETE CASCADE,
  proof_version_id  UUID REFERENCES proof_versions(id) ON DELETE SET NULL,
  notes             TEXT NOT NULL,
  attachment_url    TEXT,
  attachment_name   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_revision_requests_intake ON revision_requests (intake_id);
CREATE INDEX IF NOT EXISTS idx_revision_requests_proof  ON revision_requests (proof_version_id);
