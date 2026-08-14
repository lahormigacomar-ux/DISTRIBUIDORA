-- ==========================================
-- CONSOLIDATED MIGRATION - RUN THIS IN SUPABASE SQL EDITOR
-- ==========================================

-- 1. Add 'icon' column to families table
ALTER TABLE families ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'construction';

-- 2. Add 'code' column to product_variants table
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS code TEXT;

-- 3. (Optional but recommended) Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';
