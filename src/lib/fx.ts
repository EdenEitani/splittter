import { supabase } from './supabase'

/** Today's date as YYYY-MM-DD */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Ensure today's rates for the group's base currency (and USD as cross-rate
 * fallback) exist in the DB.
 *
 * Pass the GROUP's base currency (e.g. 'ILS'), not the expense currency.
 * This stores ILS-based rates, so any expense currency → ILS conversion is
 * available via the inverse lookup (rates_json['GBP'] = 0.243 → 1/0.243 ≈ 4.11).
 */
export async function ensureDailyRates(groupCurrency: string): Promise<void> {
  const date = todayISO()
  const upper = groupCurrency.toUpperCase()

  // Always also ensure USD — universal cross-rate base for exotic currencies
  const currenciesToEnsure = upper === 'USD' ? ['USD'] : [upper, 'USD']

  await Promise.all(
    currenciesToEnsure.map(async (currency) => {
      const { data } = await supabase
        .from('fx_rates')
        .select('id')
        .eq('base_currency', currency)
        .eq('date', date)
        .maybeSingle()

      if (data) return // Already have today's rates

      const { error } = await supabase.functions.invoke('fx-refresh-daily-rates', {
        body: { base_currency: currency, date },
      })
      if (error) console.error(`[fx] Failed to fetch rates for ${currency}:`, error)
    })
  )
}

/**
 * Look up a stored exchange rate from the DB.
 * Priority:
 *   1. Direct: base=from, rates[to]
 *   2. Inverse: base=to, rates[from]  → 1/rate
 *   3. Cross-rate via USD: (USD→to) / (USD→from)
 */
async function lookupRate(from: string, to: string, date: string): Promise<number | null> {
  // 1. Direct lookup
  const { data: direct } = await supabase
    .from('fx_rates')
    .select('rates_json')
    .eq('base_currency', from)
    .eq('date', date)
    .maybeSingle()

  if (direct?.rates_json) {
    const rate = (direct.rates_json as Record<string, number>)[to]
    if (rate) return rate
  }

  // 2. Inverse lookup
  const { data: inv } = await supabase
    .from('fx_rates')
    .select('rates_json')
    .eq('base_currency', to)
    .eq('date', date)
    .maybeSingle()

  if (inv?.rates_json) {
    const inverseRate = (inv.rates_json as Record<string, number>)[from]
    if (inverseRate) return 1 / inverseRate
  }

  // 3. Cross-rate via USD (from→USD→to)
  const { data: usdRow } = await supabase
    .from('fx_rates')
    .select('rates_json')
    .eq('base_currency', 'USD')
    .eq('date', date)
    .maybeSingle()

  if (usdRow?.rates_json) {
    const usd = usdRow.rates_json as Record<string, number>
    const fromRate = usd[from] // USD → from
    const toRate = usd[to]     // USD → to
    if (fromRate && toRate) return toRate / fromRate
  }

  return null
}

/**
 * Get the exchange rate for fromCurrency → toCurrency on a given date.
 * Call ensureDailyRates first so the rates exist in the DB.
 */
export async function getFxRate(
  fromCurrency: string,
  toCurrency: string,
  date: string
): Promise<number> {
  if (fromCurrency === toCurrency) return 1

  const rate = await lookupRate(fromCurrency.toUpperCase(), toCurrency.toUpperCase(), date)
  if (rate !== null) return rate

  throw new Error(
    `Exchange rate unavailable for ${fromCurrency}→${toCurrency}. Please check your connection and try again.`
  )
}

/** Manually trigger a rates refresh (used by the Settings page button). */
export async function refreshDailyRates(baseCurrency: string): Promise<void> {
  const { error } = await supabase.functions.invoke('fx-refresh-daily-rates', {
    body: { base_currency: baseCurrency, date: todayISO() },
  })
  if (error) throw error
}
