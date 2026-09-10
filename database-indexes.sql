-- Optional database indexes for improved webhook performance
-- Run these in your Neon database console for faster lookups

-- Index for emails table provider_msg_id lookups (used by webhook updates)
CREATE INDEX IF NOT EXISTS idx_emails_provider_msg_id ON emails(provider_msg_id);

-- Index for email_events table provider_msg_id lookups (used for event queries)
CREATE INDEX IF NOT EXISTS idx_email_events_provider_msg_id ON email_events(provider_msg_id);

-- Additional useful indexes for common queries
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at);
CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_created_at ON email_events(created_at);

-- Verify indexes were created
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('emails', 'email_events')
ORDER BY tablename, indexname;
