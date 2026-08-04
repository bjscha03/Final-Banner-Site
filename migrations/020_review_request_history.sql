-- Append-only audit history for manual Admin review-request emails.
-- A partial unique index permits intentional resends after completion while
-- preventing duplicate concurrent sends for the same order.
CREATE TABLE IF NOT EXISTS review_request_history (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  resend_message_id TEXT,
  admin_identifier TEXT,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  failure_reason TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS review_request_history_one_sending_per_order_idx
  ON review_request_history (order_id)
  WHERE status = 'sending';

CREATE INDEX IF NOT EXISTS review_request_history_order_sent_idx
  ON review_request_history (order_id, sent_at DESC)
  WHERE status = 'sent';
