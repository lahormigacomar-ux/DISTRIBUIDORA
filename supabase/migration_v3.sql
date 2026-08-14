-- Add 'color' column to families table for PDF customization
ALTER TABLE families ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#00bcd4';

-- Update previous migration_v2.sql was only for code, this is v3
