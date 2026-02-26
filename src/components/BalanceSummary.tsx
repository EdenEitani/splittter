import { formatMoney } from '@/lib/money'
import { simplifyDebts } from '@/lib/balance'
import { ArrowRight, CheckCircle } from 'lucide-react'
import type { UserBalance } from '@/types'

interface BalanceSummaryProps {
  balances: UserBalance[]
  currency: string
  currentUserId?: string
  onSettle?: (fromId: string, toId: string) => void
}

export function BalanceSummary({
  balances,
  currency,
  currentUserId,
  onSettle,
}: BalanceSummaryProps) {
  const debts = simplifyDebts(balances)
  const allSettled = debts.length === 0

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
    </div>
  )
}
