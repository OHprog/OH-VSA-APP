-- Add 'plebian' role to user_role enum.
-- Plebian users can only view the Dashboard — all other routes redirect to /.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'plebian';
