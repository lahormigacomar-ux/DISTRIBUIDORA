-- Add 'is_active' column to products and product_variants
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';
