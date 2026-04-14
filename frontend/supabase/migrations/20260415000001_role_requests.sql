-- Migration: role_requests table
-- Allows viewer/visitor users to request the analyst role.
-- Admins can approve or deny requests in the Admin portal.

CREATE TABLE public.role_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_role  public.app_role NOT NULL,
  from_role       public.app_role NOT NULL,
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by     UUID REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.role_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users see own requests"
  ON public.role_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all requests (OR semantics with above policy)
CREATE POLICY "Admins see all requests"
  ON public.role_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Users can submit their own requests
CREATE POLICY "Users insert own requests"
  ON public.role_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admins can approve or deny requests
CREATE POLICY "Admins update requests"
  ON public.role_requests FOR UPDATE TO authenticated
  USING  (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Prevent a user from having more than one pending request at a time
CREATE UNIQUE INDEX role_requests_one_pending_per_user
  ON public.role_requests (user_id)
  WHERE status = 'pending';

-- Index for admin queries (pending requests sorted by submission time)
CREATE INDEX role_requests_status_idx
  ON public.role_requests (status, created_at DESC);
