-- Neon Database Schema for Custom Banner Ecommerce Site
-- Run this in your Neon database console to set up the tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users/Profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    username VARCHAR(255),
    is_admin BOOLEAN DEFAULT FALSE,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL, -- For guest orders
    subtotal_cents INTEGER NOT NULL,
    tax_cents INTEGER NOT NULL,
    total_cents INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
    tracking_number VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    width_in INTEGER NOT NULL,
    height_in INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    material VARCHAR(50) NOT NULL,
    grommets VARCHAR(50) DEFAULT 'none',
    rope_feet INTEGER DEFAULT 0,
    pole_pockets BOOLEAN DEFAULT FALSE,
    line_total_cents INTEGER NOT NULL,
    file_key VARCHAR(255), -- Customer uploaded file reference
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- Email verification table
CREATE TABLE IF NOT EXISTS email_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Email events table for logging
CREATE TABLE IF NOT EXISTS email_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL,
    to_email TEXT NOT NULL,
    provider_msg_id TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    order_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Password resets table
CREATE TABLE IF NOT EXISTS password_resets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add email status columns to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS confirmation_email_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for email tables
CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_events_order_id ON email_events(order_id);
CREATE INDEX IF NOT EXISTS idx_email_events_created_at ON email_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(type);
CREATE INDEX IF NOT EXISTS idx_email_events_status ON email_events(status);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_confirmation_email_status ON orders(confirmation_email_status);

-- Insert sample admin user
INSERT INTO profiles (id, email, full_name, is_admin) 
VALUES ('demo-user-123', 'brandon.schaefer@hotmail.com', 'Brandon Schaefer', TRUE)
ON CONFLICT (email) DO UPDATE SET 
    full_name = EXCLUDED.full_name,
    is_admin = EXCLUDED.is_admin;

-- Insert sample orders with tax calculations (6% tax rate)
INSERT INTO orders (id, user_id, email, subtotal_cents, tax_cents, total_cents, status, tracking_number, created_at) VALUES
('order-1', 'demo-user-123', 'brandon.schaefer@hotmail.com', 3600, 216, 3816, 'paid', '1234567890123', NOW() - INTERVAL '5 days'),
('order-2', 'demo-user-123', 'brandon.schaefer@hotmail.com', 7200, 432, 7632, 'paid', NULL, NOW() - INTERVAL '3 days'),
('order-3', 'demo-user-123', 'brandon.schaefer@hotmail.com', 1800, 108, 1908, 'pending', NULL, NOW() - INTERVAL '2 days'),
('order-4', 'demo-user-123', 'brandon.schaefer@hotmail.com', 5400, 324, 5724, 'paid', '9876543210987', NOW() - INTERVAL '1 day'),
('order-5', 'demo-user-123', 'brandon.schaefer@hotmail.com', 2700, 162, 2862, 'paid', NULL, NOW() - INTERVAL '6 hours'),
('order-6', 'demo-user-123', 'brandon.schaefer@hotmail.com', 4500, 270, 4770, 'pending', NULL, NOW() - INTERVAL '2 hours'),
('order-7', 'demo-user-123', 'brandon.schaefer@hotmail.com', 9000, 540, 9540, 'paid', '5555666677778', NOW() - INTERVAL '1 hour')
ON CONFLICT (id) DO NOTHING;

-- Insert sample order items
INSERT INTO order_items (order_id, width_in, height_in, quantity, material, grommets, rope_feet, pole_pockets, line_total_cents) VALUES
('order-1', 48, 24, 1, '13oz', 'corners', 16, FALSE, 3600),
('order-2', 72, 36, 1, '15oz', 'all-sides', 24, TRUE, 7200),
('order-3', 24, 18, 1, '13oz', 'none', 0, FALSE, 1800),
('order-4', 60, 30, 1, '18oz', 'corners', 20, FALSE, 5400),
('order-5', 36, 24, 1, '13oz', 'corners', 14, FALSE, 2700),
('order-6', 48, 36, 1, '15oz', 'all-sides', 18, TRUE, 4500),
('order-7', 96, 48, 1, '18oz', 'all-sides', 32, TRUE, 9000)
ON CONFLICT (id) DO NOTHING;
