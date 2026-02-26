-- ============================================================
-- Migration 002: Seed Categories
-- ============================================================

-- ── "all" group type – universal categories ────────────────────
INSERT INTO public.categories (group_type, name, icon, sort_order, color_token) VALUES
  ('all', 'General',    '💸', 0,  'gray'),
  ('all', 'Food',       '🍽️', 1,  'orange'),
  ('all', 'Drinks',     '🍺', 2,  'amber'),
  ('all', 'Coffee',     '☕', 3,  'yellow'),
  ('all', 'Shopping',   '🛍️', 4,  'pink'),
  ('all', 'Transport',  '🚗', 5,  'blue'),
  ('all', 'Taxi/Uber',  '🚕', 6,  'blue'),
  ('all', 'Other',      '📌', 99, 'gray');

-- ── Trip ───────────────────────────────────────────────────────
INSERT INTO public.categories (group_type, name, icon, sort_order, color_token) VALUES
  ('trip', 'Flights',     '✈️', 0,  'sky'),
  ('trip', 'Hotel',       '🏨', 1,  'indigo'),
  ('trip', 'Lodging',     '🏠', 2,  'indigo'),
  ('trip', 'Activities',  '🎟️', 3,  'purple'),
  ('trip', 'Museum',      '🏛️', 4,  'purple'),
  ('trip', 'Tours',       '🗺️', 5,  'teal'),
  ('trip', 'Car Rental',  '🚘', 6,  'blue'),
  ('trip', 'Train',       '🚂', 7,  'blue'),
  ('trip', 'Ferry',       '⛴️', 8,  'teal'),
  ('trip', 'Visa/Fees',   '🛂', 9,  'red'),
  ('trip', 'Insurance',   '🛡️', 10, 'green'),
  ('trip', 'Souvenirs',   '🎁', 11, 'pink');

-- ── House ──────────────────────────────────────────────────────
INSERT INTO public.categories (group_type, name, icon, sort_order, color_token) VALUES
  ('house', 'Rent',        '🏠', 0,  'indigo'),
  ('house', 'Electricity', '⚡', 1,  'yellow'),
  ('house', 'Water',       '💧', 2,  'blue'),
  ('house', 'Gas',         '🔥', 3,  'orange'),
  ('house', 'Internet',    '📡', 4,  'teal'),
  ('house', 'Groceries',   '🛒', 5,  'green'),
  ('house', 'Cleaning',    '🧹', 6,  'blue'),
  ('house', 'Repairs',     '🔧', 7,  'red'),
  ('house', 'Furniture',   '🛋️', 8,  'amber'),
  ('house', 'Subscriptions','📺', 9,  'purple');

-- ── Event ──────────────────────────────────────────────────────
INSERT INTO public.categories (group_type, name, icon, sort_order, color_token) VALUES
  ('event', 'Venue',      '🏟️', 0,  'purple'),
  ('event', 'Catering',   '🍱', 1,  'orange'),
  ('event', 'Decor',      '🎉', 2,  'pink'),
  ('event', 'Music',      '🎵', 3,  'indigo'),
  ('event', 'Photos',     '📸', 4,  'gray'),
  ('event', 'Invites',    '📬', 5,  'blue'),
  ('event', 'Activities', '🎮', 6,  'green'),
  ('event', 'Gifts',      '🎁', 7,  'red');

-- ── Roommates ──────────────────────────────────────────────────
INSERT INTO public.categories (group_type, name, icon, sort_order, color_token) VALUES
  ('roommates', 'Rent',         '🏠', 0,  'indigo'),
  ('roommates', 'Utilities',    '💡', 1,  'yellow'),
  ('roommates', 'Internet',     '📡', 2,  'teal'),
  ('roommates', 'Groceries',    '🛒', 3,  'green'),
  ('roommates', 'Household',    '🧴', 4,  'blue'),
  ('roommates', 'Takeout',      '🥡', 5,  'orange'),
  ('roommates', 'Parking',      '🅿️', 6,  'gray'),
  ('roommates', 'Subscriptions','📺', 7,  'purple');

-- ── Custom ─────────────────────────────────────────────────────
INSERT INTO public.categories (group_type, name, icon, sort_order, color_token) VALUES
  ('custom', 'Bills',     '🧾', 0, 'gray'),
  ('custom', 'Work',      '💼', 1, 'blue'),
  ('custom', 'Health',    '💊', 2, 'green'),
  ('custom', 'Education', '📚', 3, 'indigo'),
  ('custom', 'Sport',     '⚽', 4, 'orange'),
  ('custom', 'Charity',   '❤️', 5, 'red');
