-- ============================================================
-- Migration 007: Group Bill Forwarding Email
-- ============================================================

ALTER TABLE public.groups
  ADD COLUMN inbound_email_token UUID DEFAULT gen_random_uuid() NOT NULL,
  ADD COLUMN bill_default_payer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Unique index so we can look up group by token
CREATE UNIQUE INDEX idx_groups_inbound_email_token ON public.groups(inbound_email_token);
