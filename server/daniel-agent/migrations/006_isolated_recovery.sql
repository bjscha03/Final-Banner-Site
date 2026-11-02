-- Additive controls only. Applying this migration never starts sending,
-- changes existing pause flags, approves a draft, or alters task history.
ALTER TABLE daniel_sales.settings ADD COLUMN IF NOT EXISTS cold_outreach_paused boolean NOT NULL DEFAULT false;
ALTER TABLE daniel_sales.settings ADD COLUMN IF NOT EXISTS required_draft_contract text;
