-- Add 'plebian' role to app_role enum.
-- Plebian users can only view the Dashboard — all other routes redirect to /.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'plebian';
