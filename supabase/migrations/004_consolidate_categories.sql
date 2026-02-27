-- ============================================================
-- Migration 004: Consolidate Categories
-- Merges redundant/granular categories into broader ones.
-- ============================================================

BEGIN;

-- ── 1. 'all' group type: merge Drinks + Coffee → Food ──────────────────────
UPDATE public.expenses
  SET category_id = (SELECT id FROM public.categories WHERE group_type='all' AND name='Food' LIMIT 1)
  WHERE category_id IN (SELECT id FROM public.categories WHERE group_type='all' AND name IN ('Drinks','Coffee'));

-- 'all': Taxi/Uber → Transport
UPDATE public.expenses
  SET category_id = (SELECT id FROM public.categories WHERE group_type='all' AND name='Transport' LIMIT 1)
  WHERE category_id IN (SELECT id FROM public.categories WHERE group_type='all' AND name='Taxi/Uber');

DELETE FROM public.categories WHERE group_type='all' AND name IN ('Drinks', 'Coffee', 'Taxi/Uber');

-- Fix sort_orders for 'all'
UPDATE public.categories SET sort_order=1 WHERE group_type='all' AND name='Food';
UPDATE public.categories SET sort_order=2 WHERE group_type='all' AND name='Shopping';
UPDATE public.categories SET sort_order=3 WHERE group_type='all' AND name='Transport';
UPDATE public.categories SET sort_order=99 WHERE group_type='all' AND name='Other';

-- ── 2. 'trip' group type consolidation ─────────────────────────────────────

-- Rename Lodging → Accommodation (becomes the single hotel/stay category)
UPDATE public.categories SET name='Accommodation', icon='🏨', sort_order=1
  WHERE group_type='trip' AND name='Lodging';

-- Hotel → Accommodation
UPDATE public.expenses
  SET category_id = (SELECT id FROM public.categories WHERE group_type='trip' AND name='Accommodation' LIMIT 1)
  WHERE category_id IN (SELECT id FROM public.categories WHERE group_type='trip' AND name='Hotel');
DELETE FROM public.categories WHERE group_type='trip' AND name='Hotel';

-- Museum + Tours → Activities
UPDATE public.expenses
  SET category_id = (SELECT id FROM public.categories WHERE group_type='trip' AND name='Activities' LIMIT 1)
  WHERE category_id IN (SELECT id FROM public.categories WHERE group_type='trip' AND name IN ('Museum','Tours'));
DELETE FROM public.categories WHERE group_type='trip' AND name IN ('Museum', 'Tours');

-- Rename Car Rental → Transport (absorbs Train + Ferry too)
UPDATE public.categories SET name='Transport', icon='🚗', sort_order=3
  WHERE group_type='trip' AND name='Car Rental';

-- Train + Ferry → Transport
UPDATE public.expenses
  SET category_id = (SELECT id FROM public.categories WHERE group_type='trip' AND name='Transport' LIMIT 1)
  WHERE category_id IN (SELECT id FROM public.categories WHERE group_type='trip' AND name IN ('Train','Ferry'));
DELETE FROM public.categories WHERE group_type='trip' AND name IN ('Train', 'Ferry');

-- Tidy sort_orders for trip
UPDATE public.categories SET sort_order=0 WHERE group_type='trip' AND name='Flights';
UPDATE public.categories SET sort_order=2 WHERE group_type='trip' AND name='Activities';
UPDATE public.categories SET sort_order=4 WHERE group_type='trip' AND name='Visa/Fees';
UPDATE public.categories SET sort_order=5 WHERE group_type='trip' AND name='Insurance';
UPDATE public.categories SET sort_order=6 WHERE group_type='trip' AND name='Souvenirs';

COMMIT;
