import { formatMoney } from '@/lib/money'
import { simplifyDebts } from '@/lib/balance'
import { ArrowRight, CheckCircle } from 'lucide-react'
import type { Expense, UserBalance } from '@/types'

// ── Colour palette ─────────────────────────────────────────────────────────────

const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#6366f1',
]

// ── Mini donut chart (pure SVG) ────────────────────────────────────────────────

interface DonutSegment {
  label: string
  value: number
  color: string
  icon?: string
}

function DonutChart({ segments, size = 140 }: { segments: DonutSegment[]; size?: number }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return null

  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 8
  const innerR = r - 22

  let cumulativeAngle = -Math.PI / 2
  const paths: { d: string; color: string }[] = []

  for (const seg of segments) {
    const fraction = seg.value / total
    if (fraction < 0.001) continue
    const startAngle = cumulativeAngle
    const sweepAngle = fraction * 2 * Math.PI
    // Leave a tiny gap between segments
    const endAngle = startAngle + sweepAngle - 0.02

    const x1 = cx + r * Math.cos(startAngle)
    const y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)
    const ix1 = cx + innerR * Math.cos(endAngle)
    const iy1 = cy + innerR * Math.sin(endAngle)
    const ix2 = cx + innerR * Math.cos(startAngle)
    const iy2 = cy + innerR * Math.sin(startAngle)
    const largeArc = sweepAngle > Math.PI ? 1 : 0

    const d = [
      `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      `L ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
      'Z',
    ].join(' ')

    paths.push({ d, color: seg.color })
    cumulativeAngle += sweepAngle
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} />
      ))}
      {/* Inner circle */}
      <circle cx={cx} cy={cy} r={innerR - 2} fill="white" />
    </svg>
  )
}

// ── Chart section wrapper ──────────────────────────────────────────────────────

function ChartSection({
  title,
  segments,
  currency,
}: {
  title: string
  segments: DonutSegment[]
  currency: string
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="p-4 flex items-start gap-5">
        <DonutChart segments={segments} />
        {/* Legend */}
        <div className="flex-1 min-w-0 space-y-2 py-1">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-xs text-gray-600 truncate flex-1">
                {seg.icon && <span className="mr-1">{seg.icon}</span>}
                {seg.label}
              </span>
              <span className="text-xs font-semibold text-gray-800 flex-shrink-0">
                {formatMoney(seg.value, currency)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface BalanceSummaryProps {
  balances: UserBalance[]
  currency: string
  currentUserId?: string
  expenses?: Expense[]
  onSettle?: (fromId: string, toId: string) => void
}

export function BalanceSummary({
  balances,
  currency,
  currentUserId,
  expenses = [],
  onSettle,
}: BalanceSummaryProps) {
  const debts = simplifyDebts(balances)
  const allSettled = debts.length === 0

  // ── Build category chart data ───────────────────────────────────────────────
  const categoryMap = new Map<string, { label: string; icon: string; total: number }>()
  for (const exp of expenses) {
    const key = exp.category_id ?? '__uncategorized__'
    const label = exp.category?.name ?? 'Uncategorized'
    const icon = exp.category?.icon ?? '💸'
    const existing = categoryMap.get(key)
    if (existing) {
      existing.total += exp.group_amount
    } else {
      categoryMap.set(key, { label, icon, total: exp.group_amount })
    }
  }
  const categorySegments: DonutSegment[] = Array.from(categoryMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map((v, i) => ({
      label: v.label,
      icon: v.icon,
      value: v.total,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }))

  // ── Build per-spender chart data ────────────────────────────────────────────
  // Sum share_amount_group_currency for all participants (role='participant') per user
  const spenderMap = new Map<string, { name: string; total: number }>()
  for (const exp of expenses) {
    const participants = (exp.participants ?? []).filter(p => p.role === 'participant')
    for (const p of participants) {
      const name = p.profile?.display_name ?? p.user_id.slice(0, 6)
      const existing = spenderMap.get(p.user_id)
      if (existing) {
        existing.total += p.share_amount_group_currency ?? 0
      } else {
        spenderMap.set(p.user_id, { name, total: p.share_amount_group_currency ?? 0 })
      }
    }
  }
  const spenderSegments: DonutSegment[] = Array.from(spenderMap.values())
    .sort((a, b) => b.total - a.total)
    .map((v, i) => ({
      label: v.name,
      value: v.total,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }))

  return (
    <div className="space-y-3">
      {/* Per-user balances */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-gray-50">
          <h3 className="text-sm font-semibold text-gray-700">Balances</h3>
        </div>
        {balances.length === 0 ? (
          <div className="px-4 py-3 text-sm text-gray-400">No members yet</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {balances.map(b => (
              <div key={b.user_id} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">
                    {b.profile.display_name[0].toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-800 font-medium">
                    {b.profile.display_name.split(' ')[0]}
                    {b.user_id === currentUserId && (
                      <span className="text-gray-400 font-normal"> (you)</span>
                    )}
                  </span>
                </div>
                <span
                  className={
                    b.net_minor === 0
                      ? 'text-sm text-gray-400'
                      : b.net_minor > 0
                      ? 'text-sm font-semibold text-green-600'
                      : 'text-sm font-semibold text-red-500'
                  }
                >
                  {b.net_minor === 0
                    ? 'Settled'
                    : b.net_minor > 0
                    ? `+${formatMoney(b.net_minor, currency)}`
                    : formatMoney(b.net_minor, currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Simplified debts */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-gray-50">
          <h3 className="text-sm font-semibold text-gray-700">Who pays whom</h3>
        </div>
        {allSettled ? (
          <div className="px-4 py-4 flex items-center gap-2 text-green-600">
            <CheckCircle size={16} />
            <span className="text-sm font-medium">All settled up!</span>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {debts.map((d, i) => {
              const from = balances.find(b => b.user_id === d.from_user_id)
              const to = balances.find(b => b.user_id === d.to_user_id)
              const fromName = from?.profile.display_name.split(' ')[0] ?? '?'
              const toName = to?.profile.display_name.split(' ')[0] ?? '?'
              const isYou = d.from_user_id === currentUserId

              return (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className={isYou ? 'font-semibold text-blue-700' : 'text-gray-700'}>
                      {isYou ? 'You' : fromName}
                    </span>
                    <ArrowRight size={14} className="text-gray-300" />
                    <span className="text-gray-700">{toName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {formatMoney(d.amount_minor, currency)}
                    </span>
                    {isYou && onSettle && (
                      <button
                        onClick={() => onSettle(d.from_user_id, d.to_user_id)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg transition-colors"
                      >
                        Settle
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Category spending chart */}
      {categorySegments.length > 0 && (
        <ChartSection
          title="Spending by category"
          segments={categorySegments}
          currency={currency}
        />
      )}

      {/* Per-spender chart */}
      {spenderSegments.length > 0 && (
        <ChartSection
          title="Spending by person"
          segments={spenderSegments}
          currency={currency}
        />
      )}
    </div>
  )
}
