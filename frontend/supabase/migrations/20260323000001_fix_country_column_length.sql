-- Fix: country column was VARCHAR(2) but frontend sends "INT" (3 chars) for international suppliers
ALTER TABLE public.suppliers
  ALTER COLUMN country TYPE VARCHAR(10);
