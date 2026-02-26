-- ============================================================
-- Migration 001: Initial Schema
-- Splittter – expense splitting app
-- ============================================================

-- ─── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Profiles ─────────────────────────────────────────────────
-- Mirrors auth.users; created automatically via trigger
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url   TEXT,
  email        TEXT,                  -- denormalized for member lookup by email
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Trigger: auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), 'User'),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Groups ───────────────────────────────────────────────────
CREATE TABLE public.groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'custom'
                  CHECK (type IN ('trip','house','event','roommates','custom')),
  base_currency TEXT NOT NULL DEFAULT 'USD',
  created_by    UUID NOT NULL REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ─── Group Members ────────────────────────────────────────────
CREATE TABLE public.group_members (
  group_id  UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member'
              CHECK (role IN ('admin','member')),
  joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

-- ─── Categories ───────────────────────────────────────────────
CREATE TABLE public.categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_type  TEXT NOT NULL,   -- 'trip'|'house'|'event'|'roommates'|'custom'|'all'
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '💸',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  color_token TEXT NOT NULL DEFAULT 'gray'
);

CREATE INDEX idx_categories_group_type ON public.categories(group_type);

-- ─── FX Rates ─────────────────────────────────────────────────
CREATE TABLE public.fx_rates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL,
  date          DATE NOT NULL,
  rates_json    JSONB NOT NULL,
  provider      TEXT NOT NULL DEFAULT 'open.er-api.com',
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (base_currency, date)
);

CREATE INDEX idx_fx_rates_lookup ON public.fx_rates(base_currency, date);

-- ─── Expenses ─────────────────────────────────────────────────
CREATE TABLE public.expenses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id             UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by           UUID NOT NULL REFERENCES public.profiles(id),
  label                TEXT NOT NULL,
  notes                TEXT,
  original_amount      BIGINT NOT NULL CHECK (original_amount > 0),  -- minor units
  original_currency    TEXT NOT NULL,
  group_amount         BIGINT NOT NULL CHECK (group_amount >= 0),     -- minor units, group base currency
  group_currency       TEXT NOT NULL,
  fx_rate              NUMERIC(20,10) NOT NULL DEFAULT 1,
  fx_date              DATE NOT NULL,
  category_id          UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  category_confidence  NUMERIC(4,3),       -- 0.000 .. 1.000
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_expenses_group ON public.expenses(group_id, occurred_at DESC);
CREATE INDEX idx_expenses_created_by ON public.expenses(created_by);

-- ─── Expense Participants ─────────────────────────────────────
-- Each expense has rows for payers and participants
CREATE TABLE public.expense_participants (
  expense_id                  UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id                     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role                        TEXT NOT NULL CHECK (role IN ('payer','participant')),
  weight                      NUMERIC(10,6) NOT NULL DEFAULT 1,
  share_amount_group_currency BIGINT,      -- computed at creation, minor units
  PRIMARY KEY (expense_id, user_id, role)
);

CREATE INDEX idx_expense_participants_user ON public.expense_participants(user_id);

-- ─── Payments ─────────────────────────────────────────────────
CREATE TABLE public.payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by        UUID NOT NULL REFERENCES public.profiles(id),
  from_user_id      UUID NOT NULL REFERENCES public.profiles(id),
  to_user_id        UUID NOT NULL REFERENCES public.profiles(id),
  original_amount   BIGINT NOT NULL CHECK (original_amount > 0),
  original_currency TEXT NOT NULL,
  group_amount      BIGINT NOT NULL CHECK (group_amount >= 0),
  group_currency    TEXT NOT NULL,
  fx_rate           NUMERIC(20,10) NOT NULL DEFAULT 1,
  fx_date           DATE NOT NULL,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  notes             TEXT,
  CONSTRAINT payments_different_users CHECK (from_user_id != to_user_id)
);

CREATE INDEX idx_payments_group ON public.payments(group_id, occurred_at DESC);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_rates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments            ENABLE ROW LEVEL SECURITY;

-- ── profiles ──
-- Anyone can read profiles (needed for group member lookup)
CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT USING (true);

-- Users can only update their own profile
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger handles insert, so no INSERT policy needed for users
-- Service role can do everything (for trigger)

-- ── categories ──
-- Public read (seeded data)
CREATE POLICY "categories_select_all"
  ON public.categories FOR SELECT USING (true);

-- ── fx_rates ──
-- Public read; only service role / edge functions insert
CREATE POLICY "fx_rates_select_all"
  ON public.fx_rates FOR SELECT USING (true);

CREATE POLICY "fx_rates_insert_service"
  ON public.fx_rates FOR INSERT WITH CHECK (true);

CREATE POLICY "fx_rates_upsert_service"
  ON public.fx_rates FOR UPDATE USING (true);

-- ── groups ──
-- Helper function: is the current user a member of a group?
CREATE OR REPLACE FUNCTION public.is_group_member(gid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = gid AND user_id = auth.uid()
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE POLICY "groups_select_member"
  ON public.groups FOR SELECT USING (public.is_group_member(id));

CREATE POLICY "groups_insert_auth"
  ON public.groups FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "groups_update_admin"
  ON public.groups FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = id AND user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "groups_delete_admin"
  ON public.groups FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = id AND user_id = auth.uid() AND role = 'admin'
    )
  );

-- ── group_members ──
CREATE POLICY "gm_select_member"
  ON public.group_members FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "gm_insert_admin"
  ON public.group_members FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
      -- Self-join (creator adding themselves)
      user_id = auth.uid()
      OR
      -- Admin adding someone
      EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = group_members.group_id
          AND user_id = auth.uid()
          AND role = 'admin'
      )
    )
  );

CREATE POLICY "gm_delete_admin_or_self"
  ON public.group_members FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.group_members gm2
      WHERE gm2.group_id = group_members.group_id
        AND gm2.user_id = auth.uid()
        AND gm2.role = 'admin'
    )
  );

-- ── expenses ──
CREATE POLICY "expenses_select_member"
  ON public.expenses FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "expenses_insert_member"
  ON public.expenses FOR INSERT WITH CHECK (
    public.is_group_member(group_id) AND auth.uid() = created_by
  );

CREATE POLICY "expenses_update_creator"
  ON public.expenses FOR UPDATE USING (
    public.is_group_member(group_id) AND auth.uid() = created_by
  );

CREATE POLICY "expenses_delete_creator_or_admin"
  ON public.expenses FOR DELETE USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = expenses.group_id
        AND user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- ── expense_participants ──
CREATE POLICY "ep_select_group_member"
  ON public.expense_participants FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id AND public.is_group_member(e.group_id)
    )
  );

CREATE POLICY "ep_insert_group_member"
  ON public.expense_participants FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id AND public.is_group_member(e.group_id)
    )
  );

CREATE POLICY "ep_delete_creator"
  ON public.expense_participants FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id AND e.created_by = auth.uid()
    )
  );

-- ── payments ──
CREATE POLICY "payments_select_member"
  ON public.payments FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "payments_insert_member"
  ON public.payments FOR INSERT WITH CHECK (
    public.is_group_member(group_id) AND auth.uid() = created_by
  );

CREATE POLICY "payments_delete_creator_or_admin"
  ON public.payments FOR DELETE USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = payments.group_id
        AND user_id = auth.uid()
        AND role = 'admin'
    )
  );
