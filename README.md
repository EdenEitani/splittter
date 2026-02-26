# ⚡ Splittter

> Splitwise-like expense splitting, optimized for **lightning-fast entry** with a card-based UI.

## Features

- **Card-first UI**: tap categories & people — no dropdowns
- **AI categorization**: LLM auto-suggests categories as you type (400ms debounce)
- **Multi-currency**: enter in any currency, view in group base currency with live FX
- **Real-time FX rates**: fetched daily via GitHub Actions + stored per-day
- **Smart balance engine**: simplified debt settlement (minimizes transactions)
- **Mobile-first**: optimized for phone browsers with large touch targets
- **React Query caching**: fast UX with stale-while-revalidate

### Group Types & Categories

| Type | Categories |
|------|-----------|
| **Trip** | Flights, Hotel, Lodging, Activities, Car Rental, Train, Tours… |
| **House** | Rent, Electricity, Water, Gas, Internet, Groceries, Repairs… |
| **Event** | Venue, Catering, Decor, Music, Photos, Gifts… |
| **Roommates** | Rent, Utilities, Internet, Groceries, Household, Subscriptions… |
| **Custom** | Bills, Work, Health, Education, Sport, Charity… |

---

## Local Development

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) account (free tier works)

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/splittter.git
cd splittter
npm install
```

### 2. Create `.env.local`

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_BASE_PATH=/
```

### 3. Run

```bash
npm run dev
# → http://localhost:5173
```

---

## Supabase Setup

### 1. Create project at [supabase.com](https://supabase.com)

### 2. Run SQL migrations

In **SQL Editor** (Supabase dashboard), run in order:

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_seed_categories.sql
```

Or with the CLI:

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### 3. Enable Magic Link auth

Dashboard → **Authentication** → **Providers** → Email → Enable.

### 4. Deploy Edge Functions

```bash
supabase functions deploy categorize-expense
supabase functions deploy fx-refresh-daily-rates
```

### 5. Set Edge Function Secrets

Dashboard → **Edge Functions** → **Secrets**:

| Secret | Required | Description |
|--------|----------|-------------|
| `OPENAI_API_KEY` | No | LLM categorization (uses keyword fallback without it) |
| `FX_API_KEY` | No | exchangerate-api.com key (uses free open.er-api.com without it) |
| `FX_REFRESH_SECRET` | No | Auth token for GitHub Action FX refresh |

---

## Deploy to GitHub Pages

### 1. Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/splittter.git
git push -u origin main
```

### 2. Set GitHub Secrets

Repo → **Settings** → **Secrets** → **Actions**:

| Secret | Value |
|--------|-------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_BASE_PATH` | `/splittter/` (your repo name with slashes) |
| `SUPABASE_URL` | Same as above (for FX refresh workflow) |
| `SUPABASE_ANON_KEY` | Same as above |

### 3. Enable GitHub Pages

Repo → **Settings** → **Pages** → Source: **GitHub Actions**

The deploy workflow runs on every push to `main`.

**Live URL**: `https://YOUR_USERNAME.github.io/splittter/`

> **SPA routing**: The workflow copies `index.html` → `404.html` so GitHub Pages
> serves the React app on all routes (standard SPA-on-GH-Pages technique).

---

## FX Rates

### Automated (GitHub Actions)

`.github/workflows/fx-refresh.yml` runs daily at 06:00 UTC for USD, EUR, GBP.

Required repo secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`

### Manual

App → **Settings** → **Refresh rates** button.

### Free API

Uses [open.er-api.com](https://open.er-api.com) by default (no key, ~1500 req/month free).
For higher limits: [exchangerate-api.com](https://www.exchangerate-api.com) — set key as `FX_API_KEY` in Supabase secrets.

---

## LLM Categorization

Edge function `categorize-expense`:

1. **With `OPENAI_API_KEY`**: calls `gpt-4o-mini` with structured JSON prompt
2. **Without key**: uses keyword heuristics (e.g. "uber" → Transport, "airbnb" → Lodging)

To swap LLM providers, change the API URL and auth header in the edge function.

---

## Architecture

See [`docs/architecture.md`](docs/architecture.md).

**Key decisions:**
- Amounts stored as **BIGINT minor units** (cents) — no floating-point drift
- Balance computed **client-side** from raw expense/payment data
- Greedy algorithm minimizes settlement transactions
- RLS on every table — users only see groups they're members of

---

## Tech Stack

| | |
|--|--|
| Frontend | React 19 + TypeScript + Vite 7 |
| Styling | TailwindCSS v4 |
| Routing | React Router v7 |
| Data/Cache | TanStack Query v5 |
| Backend | Supabase (Postgres + Auth + Deno Edge Functions) |
| LLM | OpenAI gpt-4o-mini |
| FX | open.er-api.com |
| Hosting | GitHub Pages |

## License

MIT
