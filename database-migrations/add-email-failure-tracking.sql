-- Email Failure Tracking Migration
-- Adds per-email-type delivery status columns on the orders table so the
-- admin dashboard can show "Email delivery failed – customer did NOT
-- receive notifications" warnings and offer per-email retry buttons.
--
-- The orders table already has confirmation_email_status (added by
-- database-email-system-migration.sql / database-email-migration.sql).
-- This migration adds the analogous columns for the in-production and
-- shipped transactional emails so all three flows can be tracked
-- consistently.
--
-- Possible status values (write-side):
--   'pending'     – email has not been sent yet
--   'sent'        – Resend accepted the request (HTTP 2xx)
--   'error'       – Resend rejected the request OR threw before send
-- Possible status values (webhook-side, set by resend-webhook.cjs):
--   'delivered'   – Recipient mail server accepted the message
--   'opened'      – Recipient opened the message
--   'bounced'     – Hard bounce (mailbox does not exist, etc.)
--   'complained'  – Recipient marked as spam
--
-- Treat 'error', 'bounced', and 'complained' as failures in the UI.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS production_email_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS shipping_notification_status TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_orders_production_email_status
  ON orders(production_email_status);

CREATE INDEX IF NOT EXISTS idx_orders_shipping_notification_status
  ON orders(shipping_notification_status);

-- Backfill: any order that already has a "sent" boolean set should be
-- reflected in the new status column so existing orders don't show up as
-- "pending" forever.
UPDATE orders
SET production_email_status = 'sent'
WHERE production_email_sent IS TRUE
  AND (production_email_status IS NULL OR production_email_status = 'pending');

UPDATE orders
SET shipping_notification_status = 'sent'
WHERE shipping_notification_sent IS TRUE
  AND (shipping_notification_status IS NULL OR shipping_notification_status = 'pending');
