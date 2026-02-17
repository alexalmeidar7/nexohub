
-- Create public storage bucket for XML files
INSERT INTO storage.buckets (id, name, public) VALUES ('xml-files', 'xml-files', true);

-- Allow anyone to read XML files
CREATE POLICY "Public read access for xml files"
ON storage.objects FOR SELECT
USING (bucket_id = 'xml-files');

-- Allow anyone to upload/update XML files (no auth required for this use case)
CREATE POLICY "Public insert access for xml files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'xml-files');

CREATE POLICY "Public update access for xml files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'xml-files');

CREATE POLICY "Public delete access for xml files"
ON storage.objects FOR DELETE
USING (bucket_id = 'xml-files');
