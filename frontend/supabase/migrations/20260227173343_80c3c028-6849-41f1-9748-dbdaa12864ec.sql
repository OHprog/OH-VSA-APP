
-- 1. Add is_active to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. Create data_sources table
CREATE TABLE public.data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  module_type text NOT NULL,
  source_type text NOT NULL DEFAULT 'api',
  base_url text,
  status text NOT NULL DEFAULT 'active',
  last_error text,
  last_sync_at timestamptz,
  schedule_cron text,
  is_free boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage data sources" ON public.data_sources
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view data sources" ON public.data_sources
  FOR SELECT TO authenticated
  USING (true);

-- 3. Create api_usage table
CREATE TABLE public.api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  service text NOT NULL,
  endpoint text,
  request_count integer NOT NULL DEFAULT 0,
  tokens_used integer NOT NULL DEFAULT 0,
  cost_estimate numeric(10,4) NOT NULL DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view api usage" ON public.api_usage
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Create audit_log table
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. Trigger for updated_at on data_sources
CREATE TRIGGER update_data_sources_updated_at
  BEFORE UPDATE ON public.data_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Seed some default data sources
INSERT INTO public.data_sources (name, module_type, source_type, base_url, status, is_free, schedule_cron) VALUES
  ('Czech Insolvency Registry', 'financial', 'api', 'https://isir.justice.cz', 'active', true, '0 6 * * *'),
  ('ARES (Business Register)', 'financial', 'api', 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest', 'active', true, '0 6 * * *'),
  ('EU Sanctions List', 'sanctions', 'api', 'https://data.europa.eu/api', 'active', true, '0 */6 * * *'),
  ('OFAC SDN List', 'sanctions', 'api', 'https://sanctionslistservice.ofac.treas.gov', 'active', true, '0 0 * * *'),
  ('UN Sanctions List', 'sanctions', 'api', 'https://scsanctions.un.org/resources', 'active', true, '0 0 * * *'),
  ('Credit Bureau API', 'financial', 'api', 'https://api.crif.cz', 'active', false, '0 8 * * 1'),
  ('News Aggregator', 'market', 'scrape', 'https://news.google.com', 'error', true, '0 */4 * * *'),
  ('Company Website Scanner', 'cyber', 'scrape', NULL, 'active', true, NULL),
  ('ESG Ratings Provider', 'esg', 'api', 'https://api.esgratingsprovider.com', 'inactive', false, '0 0 1 * *'),
  ('Internal Documents', 'internal', 'manual', NULL, 'active', true, NULL);

-- Update the News Aggregator to have a last_error
UPDATE public.data_sources SET last_error = 'HTTP 429: Rate limit exceeded' WHERE name = 'News Aggregator';
