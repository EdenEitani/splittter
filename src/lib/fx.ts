import { supabase } from './supabase'

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
 * Get the exchange rate for converting fromCurrency → toCurrency on a given date.
 * Auto-fetches from the edge function if rates are missing in the DB.
 */
export async function getFxRate(
  fromCurrency: string,
  toCurrency: string,
  date: string  // YYYY-MM-DD
): Promise<number> {
  if (fromCurrency === toCurrency) return 1

  const cached = await lookupRate(fromCurrency, toCurrency, date)
  if (cached !== null) return cached

  // Auto-refresh: fetch from→to base rates then retry
  for (const base of [fromCurrency, toCurrency]) {
    try {
      await supabase.functions.invoke('fx-refresh-daily-rates', {
        body: { base_currency: base.toUpperCase(), date },
      })
      const rate = await lookupRate(fromCurrency, toCurrency, date)
      if (rate !== null) return rate
    } catch {
      // continue to next base
    }
  }

  console.warn(`[fx] No rate found for ${fromCurrency}→${toCurrency} on ${date}, using 1`)
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
