-- Add 'code' column to product_variants
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS code TEXT;

-- Update server.js to handle the 'code' column in insertions
-- and PDF generation to use it.
