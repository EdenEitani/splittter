-- ============================================================
-- Migration 005: Guest profile updates + group emoji
-- ============================================================

-- Fix: allow authenticated users to update guest profiles
-- (previous policy only allowed users to update their own profile)
CREATE POLICY "profiles_update_guest"
  ON public.profiles FOR UPDATE
  USING (is_guest = TRUE AND auth.uid() IS NOT NULL);

-- Add optional custom emoji logo to groups
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS emoji TEXT;
