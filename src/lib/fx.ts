import { supabase } from './supabase'

/** Today's date as YYYY-MM-DD */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Ensure today's rates for `baseCurrency` exist in the DB.
 * Fetches from the edge function at most once per day — if the row already
 * exists the edge function returns early without re-fetching.
 * Call this before the first expense/payment of the day.
 */
export async function ensureDailyRates(baseCurrency: string): Promise<void> {
  const date = todayISO()

  // Check if we already have today's rates locally before hitting the edge function
  const { data } = await supabase
    .from('fx_rates')
    .select('id')
    .eq('base_currency', baseCurrency.toUpperCase())
    .eq('date', date)
    .maybeSingle()

  if (data) return // Already fetched today

  // Fetch fresh rates (edge function is also idempotent on its side)
  await supabase.functions.invoke('fx-refresh-daily-rates', {
    body: { base_currency: baseCurrency.toUpperCase(), date },
  })
}

/**
 * Look up a stored exchange rate from the DB.
 * Returns null if no rate found — call ensureDailyRates first.
 */
async function lookupRate(from: string, to: string, date: string): Promise<number | null> {
  const { data } = await supabase
    .from('fx_rates')
    .select('rates_json')
    .eq('base_currency', from.toUpperCase())
    .eq('date', date)
    .maybeSingle()

  if (data?.rates_json) {
    const rate = (data.rates_json as Record<string, number>)[to.toUpperCase()]
    if (rate) return rate
  }

  // Try inverse
  const { data: inv } = await supabase
    .from('fx_rates')
    .select('rates_json')
    .eq('base_currency', to.toUpperCase())
    .eq('date', date)
    .maybeSingle()

  if (inv?.rates_json) {
    const inverseRate = (inv.rates_json as Record<string, number>)[from.toUpperCase()]
    if (inverseRate) return 1 / inverseRate
  }

  return null
}

/**
 * Get the exchange rate for fromCurrency → toCurrency on a given date.
 * Assumes ensureDailyRates has already been called for the relevant base currency.
 */
export async function getFxRate(
  fromCurrency: string,
  toCurrency: string,
  date: string
): Promise<number> {
  if (fromCurrency === toCurrency) return 1

  const rate = await lookupRate(fromCurrency, toCurrency, date)
  if (rate !== null) return rate

  console.warn(`[fx] No rate found for ${fromCurrency}→${toCurrency} on ${date}, using 1`)
  return 1
}

/** Manually trigger a rates refresh (used by the Settings page button). */
export async function refreshDailyRates(baseCurrency: string): Promise<void> {
  const { error } = await supabase.functions.invoke('fx-refresh-daily-rates', {
    body: { base_currency: baseCurrency, date: todayISO() },
  })
  if (error) throw error
}
