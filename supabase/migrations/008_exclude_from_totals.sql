ALTER TABLE groups
  ADD COLUMN exclude_from_totals boolean NOT NULL DEFAULT false;
