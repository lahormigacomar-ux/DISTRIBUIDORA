-- Add missing columns to 'products' table
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_offer BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_separator TEXT DEFAULT ' X ';

-- Add missing columns to 'product_variants' table
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS extra_prices JSONB DEFAULT '{}';
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;

-- Refresh schema cache (Supabase SQL Editor does this automatically, but good to have)
NOTIFY pgrst, 'reload schema';
