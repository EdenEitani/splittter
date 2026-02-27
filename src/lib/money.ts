/**
 * Money utilities – all DB storage uses integer minor units (cents).
 *
 * Examples:
 *   USD $12.50  → 1250 minor units   (decimals = 2)
 *   JPY ¥100    → 100  minor units   (decimals = 0)
 *   KWD 1.500   → 1500 minor units   (decimals = 3)
 */

// ─── Currency Decimal Places ──────────────────────────────────────────────────

const ZERO_DECIMAL: Record<string, true> = {
  BIF: true, CLP: true, DJF: true, GNF: true, JPY: true,
  KMF: true, KRW: true, MGA: true, PYG: true, RWF: true,
  UGX: true, UYI: true, VND: true, VUV: true, XAF: true,
  XOF: true, XPF: true,
}

const THREE_DECIMAL: Record<string, true> = {
  BHD: true, IQD: true, JOD: true, KWD: true, LYD: true,
  OMR: true, TND: true,
}

export function currencyDecimals(currency: string): number {
  const c = currency.toUpperCase()
  if (ZERO_DECIMAL[c]) return 0
  if (THREE_DECIMAL[c]) return 3
  return 2
}

/** Convert user-typed major-unit string to integer minor units */
export function toMinorUnits(amount: number | string, currency: string): number {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(n)) return 0
  const factor = Math.pow(10, currencyDecimals(currency))
  return Math.round(n * factor)
}

/** Convert stored integer minor units to major-unit number */
export function fromMinorUnits(minor: number, currency: string): number {
  const factor = Math.pow(10, currencyDecimals(currency))
  return minor / factor
}

/** Format minor units for display */
export function formatMoney(
  minor: number,
  currency: string,
  opts?: { compact?: boolean }
): string {
  const major = fromMinorUnits(minor, currency)
  const decimals = currencyDecimals(currency)

  try {
    const fmt = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      notation: opts?.compact ? 'compact' : 'standard',
    })
    return fmt.format(major)
  } catch {
    return `${currency.toUpperCase()} ${major.toFixed(decimals)}`
  }
}

/** Format for display without currency symbol */
export function formatAmount(minor: number, currency: string): string {
  const major = fromMinorUnits(minor, currency)
  const decimals = currencyDecimals(currency)
  return major.toFixed(decimals)
}

/**
 * Compute converted group_amount from original amount using fx_rate.
 * group_amount_minor = round(original_amount_minor * fx_rate)
 * where fx_rate is: 1 unit of original_currency = fx_rate units of group_currency
 */
export function convertAmount(
  originalMinor: number,
  fxRate: number
): number {
  return Math.round(originalMinor * fxRate)
}

// ─── Common currencies for quick selection ────────────────────────────────────

export const COMMON_CURRENCIES = [
  { code: 'USD', symbol: '$', flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', flag: '🇪🇺' },
  { code: 'ILS', symbol: '₪', flag: '🇮🇱' },
  { code: 'GBP', symbol: '£', flag: '🇬🇧' },
  { code: 'JPY', symbol: '¥', flag: '🇯🇵' },
  { code: 'CAD', symbol: 'C$', flag: '🇨🇦' },
  { code: 'AUD', symbol: 'A$', flag: '🇦🇺' },
  { code: 'CHF', symbol: 'Fr', flag: '🇨🇭' },
  { code: 'CNY', symbol: '¥', flag: '🇨🇳' },
  { code: 'INR', symbol: '₹', flag: '🇮🇳' },
  { code: 'MXN', symbol: '$', flag: '🇲🇽' },
  { code: 'BRL', symbol: 'R$', flag: '🇧🇷' },
  { code: 'SEK', symbol: 'kr', flag: '🇸🇪' },
  { code: 'NOK', symbol: 'kr', flag: '🇳🇴' },
  { code: 'DKK', symbol: 'kr', flag: '🇩🇰' },
  { code: 'NZD', symbol: '$', flag: '🇳🇿' },
  { code: 'SGD', symbol: '$', flag: '🇸🇬' },
  { code: 'HKD', symbol: '$', flag: '🇭🇰' },
  { code: 'KRW', symbol: '₩', flag: '🇰🇷' },
  { code: 'THB', symbol: '฿', flag: '🇹🇭' },
]

export function getCurrencySymbol(code: string): string {
  return COMMON_CURRENCIES.find(c => c.code === code)?.symbol ?? code
}
