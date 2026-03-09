-- Allow authenticated users to download from the reports storage bucket.
CREATE POLICY "Authenticated can download reports"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'reports');
