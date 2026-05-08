# Supabase -> Firebase Migration Runbook

This project is relational and currently uses Supabase-specific queries and RPC.
The migration files in this branch handle data transfer and Firebase backend bootstrap.

## What this branch includes

- Firestore security rules: `firestore.rules`
- Firestore indexes: `firestore.indexes.json`
- Firebase config: `firebase.json`
- Firebase function replacing invite RPC: `firebase-functions/index.mjs`
- Data migration scripts:
  - `scripts/export-supabase-json.mjs`
  - `scripts/import-firestore-json.mjs`
  - `scripts/migrate-supabase-to-firestore.mjs`

## One-time setup

1. Login and select a Firebase project.

```bash
firebase login
firebase use --add
```

2. Install function dependencies.

```bash
npm install
npm --prefix firebase-functions install
```

3. Set local migration env vars.

```bash
export SUPABASE_URL='https://your-project-ref.supabase.co'
export VITE_SUPABASE_ANON_KEY='your-anon-key-here'
export SUPABASE_EMAIL='you@example.com'
export SUPABASE_PASSWORD='your-supabase-password'
export FIREBASE_PROJECT_ID='your-project-id'
export FIREBASE_SERVICE_ACCOUNT_PATH='/absolute/path/to/service-account.json'
```

Service account JSON comes from Firebase console -> Project settings -> Service accounts.
If you have `SUPABASE_SERVICE_ROLE_KEY`, you can use that instead of `SUPABASE_EMAIL` + `SUPABASE_PASSWORD`.

## Run migration

Run in one command:

```bash
npm run migrate:supabase-to-firestore
```

Or step-by-step:

```bash
npm run migrate:export:supabase
npm run migrate:import:firestore
```

## Deploy Firebase backend config

```bash
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
```

## Manual work still required

The frontend still uses `@supabase/supabase-js` directly across hooks and pages.
Those data access paths need to be rewritten to Firestore/Auth/Functions equivalents.

Main files to port first:

- `src/hooks/useAuth.ts`
- `src/hooks/useGroups.ts`
- `src/hooks/useExpenses.ts`
- `src/hooks/usePayments.ts`
- `src/pages/JoinGroupPage.tsx`
- `src/lib/fx.ts`
- `src/hooks/useCategorize.ts`
- `src/offline/syncEngine.ts`

## Notes

- This branch intentionally keeps Supabase code in place so migration can be validated safely.
- You can run data export/import multiple times; writes are idempotent (`merge: true`).
