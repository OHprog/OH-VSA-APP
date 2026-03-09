-- ============================================================
-- Patch: missing user_roles, has_role, create_evaluation, search_suppliers
-- Apply via: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- 1. app_role enum (safe if already exists)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'analyst', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 3. has_role security-definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- 4. Admin policy on user_roles (uses has_role to avoid recursion)
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 5. Auto-assign viewer role on new signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'viewer')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. search_suppliers RPC
DROP FUNCTION IF EXISTS public.search_suppliers(text, integer);
CREATE OR REPLACE FUNCTION public.search_suppliers(
  search_term text DEFAULT '',
  p_limit int DEFAULT 10
)
RETURNS SETOF public.suppliers
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM public.suppliers
  WHERE
    search_term = '' OR
    company_name ILIKE '%' || search_term || '%' OR
    ico ILIKE '%' || search_term || '%'
  ORDER BY company_name
  LIMIT p_limit;
$$;

-- 7. create_evaluation RPC
CREATE OR REPLACE FUNCTION public.create_evaluation(
  p_supplier_id uuid,
  p_module_types text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_evaluation_id uuid;
  v_module text;
BEGIN
  INSERT INTO public.evaluations (supplier_id, created_by, status)
  VALUES (p_supplier_id, auth.uid(), 'pending')
  RETURNING id INTO v_evaluation_id;

  FOREACH v_module IN ARRAY p_module_types LOOP
    INSERT INTO public.evaluation_modules (evaluation_id, module_type, status)
    VALUES (v_evaluation_id, v_module, 'queued');
  END LOOP;

  RETURN v_evaluation_id;
END;
$$;

-- 8. Enable realtime for evaluation_modules (safe to re-run)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.evaluation_modules;
EXCEPTION WHEN others THEN NULL;
END $$;
