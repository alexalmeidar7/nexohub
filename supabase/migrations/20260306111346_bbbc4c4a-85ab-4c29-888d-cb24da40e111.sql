-- Create storage bucket for empresa assets
INSERT INTO storage.buckets (id, name, public) VALUES ('empresa-assets', 'empresa-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload empresa assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'empresa-assets');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update empresa assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'empresa-assets');

-- Allow public read access
CREATE POLICY "Public read access for empresa assets"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'empresa-assets');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated users can delete empresa assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'empresa-assets');