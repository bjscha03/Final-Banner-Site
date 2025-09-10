-- Add file_key column to order_items table for customer uploaded files
ALTER TABLE "order_items" ADD COLUMN "file_key" varchar(255);
