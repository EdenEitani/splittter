# Splittter – Architecture Notes

## Overview

Splittter is a Splitwise-like expense splitting web app optimized for fast expense entry.
It uses a static React frontend (deployable to GitHub Pages) backed by Supabase
(Postgres database, Auth, and Edge Functions).

## Stack

| Layer       | Technology                               |
|-------------|------------------------------------------|
| Frontend    | React 19 + TypeScript + Vite             |
| Styling     | TailwindCSS v4 (utility-first, zero config) |
| Routing     | React Router v7                          |
| Data layer  | TanStack Query v5 (caching + optimistic updates) |
| Backend     | Supabase (Postgres + Auth + Edge Functions) |
| LLM         | OpenAI gpt-4o-mini (with heuristic fallback) |
| FX Rates    | open.er-api.com (free) / exchangerate-api.com (paid) |
| Hosting     | GitHub Pages (frontend), Supabase (backend) |

## Directory Structure

```
splittter/
├── .github/workflows/     # CI/CD: GitHub Pages deploy + daily FX refresh
├── docs/                  # Architecture notes (this file)
├── public/                # Static assets
├── src/
│   ├── components/        # Reusable UI components
│   │   └── ui/            # Base primitives (Button, Input, Modal)
│   ├── hooks/             # React Query hooks for all data operations
│   ├── lib/               # Core utilities (money, balance, supabase, fx)
│   ├── pages/             # Full-page route components
│   └── types/             # TypeScript interfaces
├── supabase/
│   ├── functions/         # Deno edge functions
│   │   ├── categorize-expense/     # LLM + heuristic classifier
│   │   └── fx-refresh-daily-rates/ # FX rate fetcher
│   └── migrations/        # SQL migrations (run in Supabase SQL editor)
└── .env.example           # Environment variable template
```

## Data Model

### Money Storage

All amounts are stored as **BIGINT minor units** to avoid floating-point errors.

- USD $12.50 → `1250` (cents)
- JPY ¥100 → `100` (already whole units)
- KWD 1.500 → `1500` (fils)

The `currencyDecimals()` function in `src/lib/money.ts` maps each currency to its decimal places.

Each expense stores:
- `original_amount` + `original_currency` — what the user entered
- `group_amount` + `group_currency` — converted to group base currency
- `fx_rate` + `fx_date` — the exchange rate used

### Balance Engine (`src/lib/balance.ts`)

```
net_balance[user] = Σ(payer.share) - Σ(participant.share) + Σ(payment.sent) - Σ(payment.received)
```

- Positive net → others owe this user
- Negative net → this user owes others

`simplifyDebts()` uses a greedy algorithm to minimize transactions needed to settle the group.

### Expense Participants

Each expense has `expense_participants` rows with two roles:
- `payer`: who paid and how much (`share_amount_group_currency` = amount paid)
- `participant`: who owes and how much (`share_amount_group_currency` = share owed)

Split methods:
1. **Equal**: `share = total / n` with remainder distributed to first participants
2. **Custom amounts**: user specifies each person's exact share
3. **Percent**: user specifies percentages; last person gets remainder

## Auth Flow

1. User enters email → `supabase.auth.signInWithOtp()` sends magic link
2. User clicks link → Supabase handles token exchange → session set
3. Trigger `handle_new_user()` auto-creates `profiles` row on signup
4. Frontend reads session via `useAuth()` hook → redirects to protected routes

## LLM Categorization

**Flow:**
1. User types expense label → 400ms debounce → `useCategorize()` hook fires
2. Frontend calls `supabase.functions.invoke('categorize-expense', { label, group_type })`
3. Edge function:
   a. Fetches allowed categories from DB
   b. Calls OpenAI gpt-4o-mini with structured JSON prompt
   c. Falls back to keyword heuristics if LLM unavailable
4. Frontend receives `{ category_id, confidence, reasoning }`
5. Category card with matching id gets "suggested" highlight + confidence meter
6. User can tap another card to override (stored as `confidence = 1.0`, source=manual)

## FX Rate Refresh

Two paths for keeping rates current:

**On-demand**: Called when creating an expense/payment if today's rate is missing.
`src/lib/fx.ts` → `getFxRate()` → checks DB → calls edge function if needed.

**Scheduled**: GitHub Action `fx-refresh.yml` runs daily at 06:00 UTC,
calling the `fx-refresh-daily-rates` edge function via HTTP.
Supabase `pg_cron` can also be used as an alternative.

## GitHub Pages Deployment

1. Vite builds to `dist/`
2. `VITE_BASE_PATH` sets the `base` config (e.g., `/splittter/`)
3. `dist/404.html` is a copy of `dist/index.html` → handles client-side routing
   (GitHub Pages serves 404.html on all unknown paths)
4. `BrowserRouter` uses `import.meta.env.BASE_URL` as basename

## Row-Level Security

All tables have RLS enabled. Key helper:

```sql
is_group_member(group_id) → checks group_members for auth.uid()
```

- Groups: readable/writable by members only
- Expenses/Payments: readable by members, writable by creator (delete by creator or admin)
- Categories/FX rates: public read, service role write

## Performance Considerations

- TanStack Query caches all data with 30s stale time
- Group list and detail data cached independently
- Categories cached for 1 hour (rarely change)
- Optimistic updates could be added for expense creation (currently uses invalidation)
- Balance computed client-side from fetched data (no DB view needed for MVP)
