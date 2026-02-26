// Supabase Edge Function: fx-refresh-daily-rates
// Fetches exchange rates from open.er-api.com and stores in fx_rates table.
//
// Request body: { base_currency: string, date?: string }
// Can be called manually (via the app) or by a scheduled job / GitHub Action.

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

  // Allow GET (scheduled trigger) or POST (manual)
  let baseCurrency = 'USD'
  let date = todayISO()

  if (req.method === 'POST') {
    try {
      const body = await req.json() as { base_currency?: string; date?: string }
      if (body.base_currency) baseCurrency = body.base_currency.toUpperCase()
      if (body.date) date = body.date
    } catch {
      // ignore parse errors for GET requests
    }
  }

  const secret = Deno.env.get('FX_REFRESH_SECRET')
  const authHeader = req.headers.get('authorization') ?? ''

  // If a secret is configured, validate it
  if (secret && !authHeader.includes(secret)) {
    // Allow requests from same Supabase project (using anon key bearer)
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    if (!authHeader.includes(supabaseAnonKey)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Check if we already have rates for today
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

  // Fetch from open.er-api.com (free, no key required for basic usage)
  const fxApiKey = Deno.env.get('FX_API_KEY') // optional paid key for higher limits
  const apiUrl = fxApiKey
    ? `https://v6.exchangerate-api.com/v6/${fxApiKey}/latest/${baseCurrency}`
    : `https://open.er-api.com/v6/latest/${baseCurrency}`

  let rates: Record<string, number>
  let provider = 'open.er-api.com'

  try {
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      throw new Error(`FX API returned ${res.status}`)
    }

    const data = await res.json() as {
      result?: string
      rates?: Record<string, number>
      conversion_rates?: Record<string, number>
    }

    rates = data.rates ?? data.conversion_rates ?? {}
    if (fxApiKey) provider = 'exchangerate-api.com'

    if (Object.keys(rates).length === 0) {
      throw new Error('Empty rates returned from FX API')
    }
  } catch (err) {
    console.error('[fx-refresh] FX API call failed:', err)
    return new Response(
      JSON.stringify({ error: `FX API error: ${(err as Error).message}` }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Upsert into fx_rates
  const { error: dbError } = await supabase
    .from('fx_rates')
    .upsert(
      {
        base_currency: baseCurrency,
        date,
        rates_json: rates,
        provider,
      },
      { onConflict: 'base_currency,date' }
    )

  if (dbError) {
    console.error('[fx-refresh] DB upsert failed:', dbError)
    return new Response(
      JSON.stringify({ error: dbError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const currencyCount = Object.keys(rates).length
  console.log(`[fx-refresh] Stored ${currencyCount} rates for ${baseCurrency} on ${date}`)

  return new Response(
    JSON.stringify({
      message: `Stored ${currencyCount} rates for ${baseCurrency} on ${date}.`,
      base_currency: baseCurrency,
      date,
      currencies: currencyCount,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
