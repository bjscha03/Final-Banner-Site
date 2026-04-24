-- Designer-assisted (graduation) intake submissions
-- Additive: a new table for designer-assisted order requests submitted from the
-- /graduation-signs landing page. This does NOT modify existing orders, payments,
-- or admin schema. Proof versions, revision requests, and final-payment tracking
-- are intentionally deferred to a follow-up migration.

CREATE TABLE IF NOT EXISTS designer_intake_orders (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Customer info
  customer_name            VARCHAR(160) NOT NULL,
  customer_email           VARCHAR(255) NOT NULL,
  customer_phone           VARCHAR(40),

  -- Source / classification
  order_type               VARCHAR(40)  NOT NULL DEFAULT 'designer_assisted',
  source                   VARCHAR(60)  NOT NULL DEFAULT 'graduation_landing_page',
  product_type             VARCHAR(40)  NOT NULL,           -- banner | yard_sign | car_magnet

  -- Structured details
  product_specs            JSONB        NOT NULL DEFAULT '{}'::jsonb,
  graduate_info            JSONB        NOT NULL DEFAULT '{}'::jsonb,
  design_notes             JSONB        NOT NULL DEFAULT '{}'::jsonb,
  inspiration_files        JSONB        NOT NULL DEFAULT '[]'::jsonb, -- [{name,url,fileKey}]

  -- Money tracking (cents)
  design_fee_amount_cents   INTEGER      NOT NULL DEFAULT 1900,
  design_fee_paid           BOOLEAN      NOT NULL DEFAULT FALSE,
  final_product_amount_cents INTEGER,
  final_payment_paid        BOOLEAN      NOT NULL DEFAULT FALSE,

  -- Workflow status; transitions documented in code:
  --   design_requested -> proof_created -> proof_sent
  --   -> revision_requested -> proof_sent (loop)
  --   -> approved_awaiting_payment -> final_payment_paid -> in_production -> shipped -> completed
  status                   VARCHAR(40)  NOT NULL DEFAULT 'design_requested',

  -- Customer-facing approval link token (deferred flow uses this)
  approval_token           VARCHAR(64),
  approved_proof_url       TEXT,

  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_designer_intake_orders_email
  ON designer_intake_orders (customer_email);
CREATE INDEX IF NOT EXISTS idx_designer_intake_orders_status
  ON designer_intake_orders (status);
CREATE INDEX IF NOT EXISTS idx_designer_intake_orders_created_at
  ON designer_intake_orders (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_designer_intake_orders_approval_token
  ON designer_intake_orders (approval_token) WHERE approval_token IS NOT NULL;
