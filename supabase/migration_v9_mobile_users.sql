-- MIGRATION: ADD USERNAME AND PASSWORD COLUMNS FOR MOBILE USER LOGINS
-- Run this in the Supabase SQL Editor

ALTER TABLE preventistas ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE preventistas ADD COLUMN IF NOT EXISTS password TEXT;

ALTER TABLE entregadores ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE entregadores ADD COLUMN IF NOT EXISTS password TEXT;

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
