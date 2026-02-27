-- ============================================================
-- Migration 003: Guest Members
-- Allow profiles without a corresponding auth.users entry
-- so group admins can add people by name (no account needed).
-- ============================================================

-- Drop FK from profiles → auth.users
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Mark guest profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE;

-- Allow users to insert their own profile (trigger fallback)
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Allow authenticated users to insert guest profiles
CREATE POLICY "profiles_insert_guest"
  ON public.profiles FOR INSERT
  WITH CHECK (is_guest = TRUE AND auth.uid() IS NOT NULL);
