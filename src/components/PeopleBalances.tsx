import { clsx } from 'clsx'
import { formatMoney } from '@/lib/money'
import type { PersonBalance } from '@/hooks/useBalances'

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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gray-200 animate-pulse" />
              <div className="p-4 flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
                <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
                <div className="h-5 w-16 bg-gray-100 rounded animate-pulse" />
              </div>
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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {balances.map(person => {
          const isOwed = person.dominantNet > 0

          return (
            <div key={person.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className={`h-1 ${isOwed ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              <div className="p-4 flex flex-col items-center text-center gap-1.5">
                {/* Avatar */}
                <div
                  className={clsx(
                    'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white',
                    avatarColor(person.display_name),
                  )}
                >
                  {person.display_name.slice(0, 2).toUpperCase()}
                </div>

                {/* Name */}
                <p className="text-xs font-semibold text-gray-800 truncate w-full">
                  {person.display_name}
                </p>

                {/* Amount */}
                <p className={clsx(
                  'text-base font-bold leading-none',
                  isOwed ? 'text-emerald-600' : 'text-rose-500',
                )}>
                  {isOwed ? '+' : '-'}{formatMoney(Math.abs(person.dominantNet), person.dominantCurrency)}
                </p>

                {/* Label */}
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
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
