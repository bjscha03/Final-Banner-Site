-- ============================================================================
-- ABANDONED CART RECOVERY SYSTEM
-- Migration 004
-- Created: 2025-10-20
-- ============================================================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. ABANDONED CARTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS abandoned_carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- User identification (one of these will be set)
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    session_id TEXT, -- For anonymous/guest users
    
    -- Contact information (captured progressively)
    email TEXT,
    phone TEXT,
    
    -- Cart data
    cart_contents JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_value DECIMAL(10, 2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    
    -- Tracking timestamps
    last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    abandoned_at TIMESTAMP WITH TIME ZONE,
    
    -- Recovery status
    recovery_status TEXT NOT NULL DEFAULT 'active' CHECK (recovery_status IN ('active', 'abandoned', 'recovered', 'expired')),
    recovery_emails_sent INTEGER NOT NULL DEFAULT 0,
    discount_code TEXT,
    
    -- Attribution
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT user_or_session_required CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_user_id ON abandoned_carts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_session_id ON abandoned_carts(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_email ON abandoned_carts(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_recovery_status ON abandoned_carts(recovery_status);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_last_activity ON abandoned_carts(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_abandoned_at ON abandoned_carts(abandoned_at) WHERE abandoned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_created_at ON abandoned_carts(created_at DESC);

-- Composite index for abandonment detection query
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_detection 
ON abandoned_carts(recovery_status, last_activity_at) 
WHERE recovery_status = 'active';

-- ============================================================================
-- 2. CART RECOVERY LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS cart_recovery_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    abandoned_cart_id UUID NOT NULL REFERENCES abandoned_carts(id) ON DELETE CASCADE,
    
    -- Event details
    event_type TEXT NOT NULL CHECK (event_type IN ('email_sent', 'email_opened', 'email_clicked', 'email_bounced', 'sms_sent', 'cart_recovered', 'discount_applied')),
    email_sequence_number INTEGER, -- 1, 2, or 3 for email sequence
    
    -- Metadata (subject line, UTM params, etc.)
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cart_recovery_logs_cart_id ON cart_recovery_logs(abandoned_cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_recovery_logs_event_type ON cart_recovery_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_cart_recovery_logs_created_at ON cart_recovery_logs(created_at DESC);

-- ============================================================================
-- 3. DISCOUNT CODES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS discount_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Code details
    code TEXT UNIQUE NOT NULL,
    discount_percentage INTEGER NOT NULL CHECK (discount_percentage > 0 AND discount_percentage <= 100),
    discount_amount_cents INTEGER, -- Alternative to percentage
    
    -- Association
    cart_id UUID REFERENCES abandoned_carts(id) ON DELETE SET NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    
    -- Usage constraints
    single_use BOOLEAN NOT NULL DEFAULT TRUE,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMP WITH TIME ZONE,
    used_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    
    -- Validity
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code);
CREATE INDEX IF NOT EXISTS idx_discount_codes_cart_id ON discount_codes(cart_id) WHERE cart_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discount_codes_used ON discount_codes(used);
CREATE INDEX IF NOT EXISTS idx_discount_codes_expires_at ON discount_codes(expires_at);

-- ============================================================================
-- 4. UPDATE EXISTING TABLES
-- ============================================================================

-- Add discount code column to orders table if it doesn't exist
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS discount_code TEXT,
ADD COLUMN IF NOT EXISTS discount_amount_cents INTEGER DEFAULT 0;

-- Add abandoned cart reference to orders
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS abandoned_cart_id UUID REFERENCES abandoned_carts(id) ON DELETE SET NULL;

-- ============================================================================
-- 5. FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for abandoned_carts
DROP TRIGGER IF EXISTS update_abandoned_carts_updated_at ON abandoned_carts;
CREATE TRIGGER update_abandoned_carts_updated_at
    BEFORE UPDATE ON abandoned_carts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for discount_codes
DROP TRIGGER IF EXISTS update_discount_codes_updated_at ON discount_codes;
CREATE TRIGGER update_discount_codes_updated_at
    BEFORE UPDATE ON discount_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. VIEWS FOR ANALYTICS
-- ============================================================================

-- View for abandoned cart metrics
CREATE OR REPLACE VIEW abandoned_cart_metrics AS
SELECT 
    DATE_TRUNC('day', created_at) AS date,
    COUNT(*) AS total_abandoned,
    COUNT(*) FILTER (WHERE recovery_status = 'recovered') AS total_recovered,
    SUM(total_value) AS total_value,
    SUM(total_value) FILTER (WHERE recovery_status = 'recovered') AS recovered_value,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE recovery_status = 'recovered') / NULLIF(COUNT(*), 0),
        2
    ) AS recovery_rate_percent
FROM abandoned_carts
WHERE recovery_status IN ('abandoned', 'recovered', 'expired')
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

-- View for email performance
CREATE OR REPLACE VIEW email_performance_metrics AS
SELECT 
    email_sequence_number,
    COUNT(*) FILTER (WHERE event_type = 'email_sent') AS sent_count,
    COUNT(*) FILTER (WHERE event_type = 'email_opened') AS opened_count,
    COUNT(*) FILTER (WHERE event_type = 'email_clicked') AS clicked_count,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE event_type = 'email_opened') / 
        NULLIF(COUNT(*) FILTER (WHERE event_type = 'email_sent'), 0),
        2
    ) AS open_rate_percent,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE event_type = 'email_clicked') / 
        NULLIF(COUNT(*) FILTER (WHERE event_type = 'email_sent'), 0),
        2
    ) AS click_rate_percent
FROM cart_recovery_logs
WHERE email_sequence_number IS NOT NULL
GROUP BY email_sequence_number
ORDER BY email_sequence_number;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify tables were created
DO $$
BEGIN
    RAISE NOTICE 'Migration 004 completed successfully!';
    RAISE NOTICE 'Created tables: abandoned_carts, cart_recovery_logs, discount_codes';
    RAISE NOTICE 'Created views: abandoned_cart_metrics, email_performance_metrics';
END $$;
