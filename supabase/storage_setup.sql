-- 1. Create the bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow public access to read files
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'product-images' );

-- 3. Allow anyone to upload files (for development)
-- Adjust this for production if needed
CREATE POLICY "Public Upload"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'product-images' );

-- 4. Allow anyone to update/delete (for development)
CREATE POLICY "Public Update"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'product-images' );

CREATE POLICY "Public Delete"
ON storage.objects FOR DELETE
USING ( bucket_id = 'product-images' );
