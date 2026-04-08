-- Migration 012: Add canvas_state_json to order_items
-- Stores the exact Konva stage JSON or HTML preview state at submission time,
-- enabling re-rendering of the customer's approved design if needed.

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS canvas_state_json TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN order_items.canvas_state_json IS 'Exact stage/canvas JSON captured at submission for re-rendering if final_render is lost';
