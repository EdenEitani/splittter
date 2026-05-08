import { createClient } from '@supabase/supabase-js'
import { ensureDir, requireEnv, writeJson } from './_migration-utils.mjs'

const SUPABASE_URL = requireEnv('SUPABASE_URL')
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY')
}

const SUPABASE_EMAIL = process.env.SUPABASE_EMAIL
const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD
const OUT_DIR = process.env.MIGRATION_OUT_DIR || 'migration'
const OUT_FILE = `${OUT_DIR}/supabase-export.json`

const TABLES = [
  'profiles',
  'groups',
  'group_members',
  'categories',
  'fx_rates',
  'expenses',
  'expense_participants',
  'payments',
  'recurring_expenses',
]

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (!SUPABASE_EMAIL || !SUPABASE_PASSWORD) {
      throw new Error(
        'Using anon key requires SUPABASE_EMAIL and SUPABASE_PASSWORD for an authenticated export session',
      )
    }
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: SUPABASE_EMAIL,
      password: SUPABASE_PASSWORD,
    })
    if (authError) throw authError
  }

  const dump = {}
  for (const table of TABLES) {
    const rows = []
    const pageSize = 1000
    let from = 0

    while (true) {
      const to = from + pageSize - 1
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .range(from, to)

      if (error) throw new Error(`Failed exporting ${table}: ${error.message}`)
      const page = data ?? []
      rows.push(...page)
      if (page.length < pageSize) break
      from += pageSize
    }

    dump[table] = rows
    console.log(`exported ${table}: ${rows.length}`)
  }

  ensureDir(OUT_DIR)
  writeJson(OUT_FILE, dump)
  console.log(`\nWrote export file: ${OUT_FILE}`)
}

run().catch((error) => {
  console.error('\nExport failed:\n', error)
  process.exit(1)
})
