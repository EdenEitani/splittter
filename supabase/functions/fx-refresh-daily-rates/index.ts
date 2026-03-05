// Supabase Edge Function: fx-refresh-daily-rates
// Fetches exchange rates from exchangerate-api.com (with key) or open.er-api.com (free fallback).
//
// Request body: { base_currency?: string, date?: string }
// Default base_currency: ILS
//
// Auth (when FX_REFRESH_SECRET is set):
//   - GitHub Actions:  Authorization: Bearer <FX_REFRESH_SECRET>
//   - Browser client:  apikey: <SUPABASE_ANON_KEY>  (added automatically by supabase-js)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  // FX_REFRESH_SECRET protects against external API quota abuse.
  // Two valid callers:
  //   1. GitHub Actions → sends secret as Bearer token
  //   2. Browser via supabase-js → sends apikey header = SUPABASE_ANON_KEY
  const secret = Deno.env.get('FX_REFRESH_SECRET')
  if (secret) {
    const authHeader = req.headers.get('authorization') ?? ''
    const apiKeyHeader = req.headers.get('apikey') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    const hasSecret = authHeader.includes(secret)
    const isSupabaseClient = !!supabaseAnonKey && apiKeyHeader === supabaseAnonKey

    if (!hasSecret && !isSupabaseClient) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  // ── Parse request ─────────────────────────────────────────────────────────
  let baseCurrency = 'ILS'  // default: group base currency for Splittter
  let date = todayISO()

  if (req.method === 'POST') {
    try {
      const body = await req.json() as { base_currency?: string; date?: string }
      if (body.base_currency) baseCurrency = body.base_currency.toUpperCase()
      if (body.date) date = body.date
    } catch {
      // ignore parse errors
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // ── Idempotency check ─────────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('fx_rates')
    .select('id')
    .eq('base_currency', baseCurrency)
    .eq('date', date)
    .maybeSingle()

  if (existing) {
    return new Response(
      JSON.stringify({ message: `Rates for ${baseCurrency} on ${date} already exist.`, cached: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── Fetch rates: paid API first, free API as fallback ─────────────────────
  const fxApiKey = Deno.env.get('FX_API_KEY')
  let rates: Record<string, number> = {}
  let provider = 'open.er-api.com'

  if (fxApiKey) {
    try {
      const res = await fetch(
        `https://v6.exchangerate-api.com/v6/${fxApiKey}/latest/${baseCurrency}`,
        { signal: AbortSignal.timeout(10000) }
      )
      if (!res.ok) throw new Error(`exchangerate-api returned ${res.status}`)
      const data = await res.json() as { conversion_rates?: Record<string, number> }
      const fetched = data.conversion_rates ?? {}
      if (Object.keys(fetched).length === 0) throw new Error('Empty rates from exchangerate-api')
      rates = fetched
      provider = 'exchangerate-api.com'
      console.log(`[fx-refresh] Got ${Object.keys(rates).length} rates from exchangerate-api.com`)
    } catch (err) {
      console.warn('[fx-refresh] exchangerate-api.com failed, trying open.er-api.com:', (err as Error).message)
    }
  }

  if (Object.keys(rates).length === 0) {
    try {
      const res = await fetch(
        `https://open.er-api.com/v6/latest/${baseCurrency}`,
        { signal: AbortSignal.timeout(10000) }
      )
      if (!res.ok) throw new Error(`open.er-api returned ${res.status}`)
      const data = await res.json() as { rates?: Record<string, number>; conversion_rates?: Record<string, number> }
      rates = data.rates ?? data.conversion_rates ?? {}
      if (Object.keys(rates).length === 0) throw new Error('Empty rates from open.er-api.com')
      provider = 'open.er-api.com'
      console.log(`[fx-refresh] Got ${Object.keys(rates).length} rates from open.er-api.com`)
    } catch (err) {
      console.error('[fx-refresh] Both FX APIs failed:', (err as Error).message)
      return new Response(
        JSON.stringify({ error: `FX API error: ${(err as Error).message}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  // ── Persist all rates ─────────────────────────────────────────────────────
  const { error: dbError } = await supabase
    .from('fx_rates')
    .upsert(
      { base_currency: baseCurrency, date, rates_json: rates, provider },
      { onConflict: 'base_currency,date' }
    )

  if (dbError) {
    console.error('[fx-refresh] DB upsert failed:', dbError)
    return new Response(
      JSON.stringify({ error: dbError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`[fx-refresh] Stored ${Object.keys(rates).length} rates for ${baseCurrency} on ${date} via ${provider}`)

  return new Response(
    JSON.stringify({
      message: `Stored ${Object.keys(rates).length} rates for ${baseCurrency} on ${date}.`,
      base_currency: baseCurrency,
      date,
      provider,
      currencies: Object.keys(rates).length,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
