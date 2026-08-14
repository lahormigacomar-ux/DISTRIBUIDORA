-- Add technical columns support to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS technical_columns TEXT;

-- Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';
