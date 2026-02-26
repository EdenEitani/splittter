import { supabase } from './supabase'

/**
 * Get the exchange rate for converting fromCurrency → toCurrency on a given date.
 * Falls back to fetching from the DB (which is populated by the edge function).
 */
export async function getFxRate(
  fromCurrency: string,
  toCurrency: string,
  date: string  // YYYY-MM-DD
): Promise<number> {
  if (fromCurrency === toCurrency) return 1

  // Try to get from DB
  const { data } = await supabase
    .from('fx_rates')
    .select('rates_json')
    .eq('base_currency', fromCurrency.toUpperCase())
    .eq('date', date)
    .maybeSingle()

  if (data?.rates_json) {
    const rate = (data.rates_json as Record<string, number>)[toCurrency.toUpperCase()]
    if (rate) return rate
  }

  // Try inverse
  const { data: inv } = await supabase
    .from('fx_rates')
    .select('rates_json')
    .eq('base_currency', toCurrency.toUpperCase())
    .eq('date', date)
    .maybeSingle()

  if (inv?.rates_json) {
    const inverseRate = (inv.rates_json as Record<string, number>)[fromCurrency.toUpperCase()]
    if (inverseRate) return 1 / inverseRate
  }

  // No rate found, return 1 (same currency fallback)
  console.warn(`[fx] No rate found for ${fromCurrency}→${toCurrency} on ${date}`)
  return 1
}

/** Today's date as YYYY-MM-DD */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Trigger the edge function to fetch & store today's rates */
export async function refreshDailyRates(baseCurrency: string): Promise<void> {
  const { error } = await supabase.functions.invoke('fx-refresh-daily-rates', {
    body: { base_currency: baseCurrency, date: todayISO() },
  })
  if (error) throw error
}
