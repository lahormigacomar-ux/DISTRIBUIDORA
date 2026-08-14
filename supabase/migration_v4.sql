-- Add 'icon' column to families table
ALTER TABLE families ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'construction';

-- Icons options for user: 'construction', 'grid_view', 'category', 'layers', 'inventory_2'
