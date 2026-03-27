-- Reference / lookup tables for data that admins should be able to change
-- without a code deployment: countries, sectors, and AI suggested prompts.

-- ─── ref_countries ───────────────────────────────────────────────────────────
CREATE TABLE public.ref_countries (
  code        text    PRIMARY KEY,
  name        text    NOT NULL,
  sort_order  integer NOT NULL DEFAULT 99,
  is_active   boolean NOT NULL DEFAULT true
);

INSERT INTO public.ref_countries (code, name, sort_order) VALUES
  ('CZ',  'Czech Republic',        1),
  ('SK',  'Slovakia',              2),
  ('HU',  'Hungary',               3),
  ('RS',  'Serbia',                4),
  ('BG',  'Bulgaria',              5),
  ('DE',  'Germany',               6),
  ('AT',  'Austria',               7),
  ('PL',  'Poland',                8),
  ('INT', 'International / Other', 99);

ALTER TABLE public.ref_countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read countries"
  ON public.ref_countries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage countries"
  ON public.ref_countries FOR ALL TO authenticated
  USING (get_user_role() = 'admin'::user_role)
  WITH CHECK (get_user_role() = 'admin'::user_role);

-- ─── ref_sectors ─────────────────────────────────────────────────────────────
CREATE TABLE public.ref_sectors (
  name        text    PRIMARY KEY,
  sort_order  integer NOT NULL DEFAULT 99,
  is_active   boolean NOT NULL DEFAULT true
);

INSERT INTO public.ref_sectors (name, sort_order) VALUES
  ('Telecom',      1),
  ('Construction', 2),
  ('IT',           3),
  ('Energy',       4),
  ('Logistics',    5),
  ('Other',        99);

ALTER TABLE public.ref_sectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sectors"
  ON public.ref_sectors FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage sectors"
  ON public.ref_sectors FOR ALL TO authenticated
  USING (get_user_role() = 'admin'::user_role)
  WITH CHECK (get_user_role() = 'admin'::user_role);

-- ─── ref_prompts ─────────────────────────────────────────────────────────────
CREATE TABLE public.ref_prompts (
  id          serial  PRIMARY KEY,
  prompt      text    NOT NULL,
  sort_order  integer NOT NULL DEFAULT 99,
  is_active   boolean NOT NULL DEFAULT true
);

INSERT INTO public.ref_prompts (prompt, sort_order) VALUES
  ('Which suppliers have the highest risk?', 1),
  ('Summarize the portfolio health',         2),
  ('What does the financial module measure?', 3);

ALTER TABLE public.ref_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read prompts"
  ON public.ref_prompts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage prompts"
  ON public.ref_prompts FOR ALL TO authenticated
  USING (get_user_role() = 'admin'::user_role)
  WITH CHECK (get_user_role() = 'admin'::user_role);
