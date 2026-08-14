-- EMERGENCY SCHEMA SYNC
-- Run this in the Supabase SQL Editor to ensure all columns for PDF Catalogs are available.

-- 1. Ensure columns exist in 'products' table
ALTER TABLE products ADD COLUMN IF NOT EXISTS pdf_format TEXT DEFAULT '1';
ALTER TABLE products ADD COLUMN IF NOT EXISTS long_description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS show_long_description BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS technical_columns TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_separator TEXT DEFAULT ' X ';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 2. Ensure columns exist in 'product_variants' table
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 3. FORZAR RECARGA DE CACHÉ DE LA API
-- A veces Supabase tarda en reconocer las nuevas columnas. Esto fuerza la recarga.
NOTIFY pgrst, 'reload schema';
