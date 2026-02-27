import { clsx } from 'clsx'
import { formatMoney } from '@/lib/money'
import type { PersonBalance } from '@/hooks/useBalances'

// Deterministic avatar colour from display_name
const AVATAR_COLORS = [
  'bg-violet-400', 'bg-blue-500', 'bg-pink-500',
  'bg-amber-400',  'bg-emerald-500', 'bg-sky-500',
  'bg-rose-500',   'bg-teal-500',
]

function avatarColor(name: string): string {
  let hash = 0
  for (const ch of name) hash = ch.charCodeAt(0) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

interface Props {
  balances: PersonBalance[]
  loading?: boolean
}

export function PeopleBalances({ balances, loading }: Props) {
  if (loading) {
    return (
      <div className="mb-7">
        <div className="h-5 w-20 bg-gray-200 rounded animate-pulse mb-3" />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-28 bg-gray-200 rounded animate-pulse" />
                <div className="h-2.5 w-16 bg-gray-100 rounded animate-pulse" />
              </div>
              <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!balances.length) return null

  return (
    <div className="mb-7">
      <h2 className="text-lg font-bold text-gray-900 mb-3">People</h2>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
        {balances.map(person => {
          const isOwed = person.dominantNet > 0
          // Are there other currencies beyond the dominant one?
          const extraCurrencies = Object.keys(person.nets).filter(
            c => c !== person.dominantCurrency && Math.abs(person.nets[c]) > 0,
          )

          return (
            <div key={person.key} className="flex items-center gap-3 px-4 py-3.5">
              {/* Avatar */}
              <div
                className={clsx(
                  'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0',
                  avatarColor(person.display_name),
                )}
              >
                {person.display_name.slice(0, 2).toUpperCase()}
              </div>

              {/* Name + subtitle */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {person.display_name}
                </p>
                {extraCurrencies.length > 0 && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    + {extraCurrencies.map(c => {
                      const n = person.nets[c]
                      return `${n > 0 ? '+' : '-'}${formatMoney(Math.abs(n), c)}`
                    }).join(', ')}
                  </p>
                )}
              </div>

              {/* Amount + label */}
              <div className="text-right flex-shrink-0">
                <p
                  className={clsx(
                    'text-sm font-bold',
                    isOwed ? 'text-emerald-600' : 'text-red-500',
                  )}
                >
                  {isOwed ? '+' : '-'}
                  {formatMoney(Math.abs(person.dominantNet), person.dominantCurrency)}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {isOwed ? 'owes you' : 'you owe'}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
