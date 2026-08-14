-- Add PDF Format and Long Description support to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS pdf_format TEXT DEFAULT '1';
ALTER TABLE products ADD COLUMN IF NOT EXISTS long_description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS show_long_description BOOLEAN DEFAULT FALSE;

-- Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';
