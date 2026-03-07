-- ============================================================
-- Migration 006: Recurring Expenses
-- ============================================================

CREATE TABLE public.recurring_expenses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by        UUID NOT NULL REFERENCES public.profiles(id),
  label             TEXT NOT NULL,
  notes             TEXT,
  original_amount   BIGINT NOT NULL CHECK (original_amount > 0),  -- minor units
  original_currency TEXT NOT NULL,
  category_id       UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  payer_ids         JSONB NOT NULL DEFAULT '[]',      -- array of user UUID strings
  participant_ids   JSONB NOT NULL DEFAULT '[]',      -- array of user UUID strings
  split_method      TEXT NOT NULL DEFAULT 'equal'
                      CHECK (split_method IN ('equal', 'custom_amounts', 'percent')),
  custom_amounts    JSONB,    -- userId -> amount string (only for custom_amounts)
  custom_percents   JSONB,    -- userId -> percent string (only for percent)
  frequency         TEXT NOT NULL
                      CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  next_due_date     DATE NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_recurring_expenses_group ON public.recurring_expenses(group_id);
CREATE INDEX idx_recurring_expenses_due   ON public.recurring_expenses(next_due_date) WHERE active = true;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

-- Any group member can view recurring expenses
CREATE POLICY "re_select_member"
  ON public.recurring_expenses FOR SELECT
  USING (public.is_group_member(group_id));

-- Group members can create recurring expenses (as themselves)
CREATE POLICY "re_insert_member"
  ON public.recurring_expenses FOR INSERT
  WITH CHECK (public.is_group_member(group_id) AND auth.uid() = created_by);

-- Only creator can update (advance next_due_date, toggle active)
CREATE POLICY "re_update_creator"
  ON public.recurring_expenses FOR UPDATE
  USING (auth.uid() = created_by);

-- Creator or group admin can delete
CREATE POLICY "re_delete_creator_or_admin"
  ON public.recurring_expenses FOR DELETE
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = recurring_expenses.group_id
        AND user_id = auth.uid()
        AND role = 'admin'
    )
  );
