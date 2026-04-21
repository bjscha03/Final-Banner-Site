-- Add rounded corner support for car magnet order items
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS rounded_corners TEXT;
