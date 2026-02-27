import { Link } from 'react-router-dom'
import { Users, Plane, Home, Calendar, Building2, Sparkles, ChevronRight } from 'lucide-react'
import type { Group } from '@/types'

const GROUP_ICONS = {
  trip: Plane,
  house: Home,
  event: Calendar,
  roommates: Building2,
  custom: Sparkles,
}

const GROUP_COLORS = {
  trip: 'bg-sky-100 text-sky-600',
  house: 'bg-green-100 text-green-600',
  event: 'bg-violet-100 text-violet-600',
  roommates: 'bg-amber-100 text-amber-600',
  custom: 'bg-gray-100 text-gray-600',
}

const GROUP_BG_ACCENT = {
  trip: 'from-sky-50 to-white',
  house: 'from-green-50 to-white',
  event: 'from-violet-50 to-white',
  roommates: 'from-amber-50 to-white',
  custom: 'from-gray-50 to-white',
}

interface GroupCardProps {
  group: Group
  memberCount?: number
  netBalance?: number
  currency?: string
}

export function GroupCard({
  group,
  memberCount,
  netBalance,
  currency,
}: GroupCardProps) {
  const Icon = GROUP_ICONS[group.type] ?? Users
  const colorClass = GROUP_COLORS[group.type] ?? GROUP_COLORS.custom
  const bgAccent = GROUP_BG_ACCENT[group.type] ?? GROUP_BG_ACCENT.custom

  const formatBalance = (amount: number, cur: string) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: cur,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(Math.abs(amount / 100))
    } catch {
      return `${Math.abs(amount)} ${cur}`
    }
  }

  const showBalance = netBalance !== undefined && currency

  return (
    <Link
      to={`/group/${group.id}`}
      className={`block bg-gradient-to-r ${bgAccent} rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 overflow-hidden`}
    >
      <div className="flex items-center gap-3 p-4">
        {/* Icon */}
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClass}`}>
          <Icon size={20} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{group.name}</h3>
          <p className="text-sm text-gray-400 capitalize mt-0.5">
            {group.type}{memberCount ? ` · ${memberCount} members` : ''}
          </p>
        </div>

        {/* Balance + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {showBalance && (
            <div className="text-right">
              {netBalance === 0 ? (
                <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Settled</span>
              ) : netBalance! > 0 ? (
                <div>
                  <div className="text-[10px] text-gray-400 leading-tight">owed to you</div>
                  <div className="text-sm font-bold text-green-600">
                    +{formatBalance(netBalance!, currency!)}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-[10px] text-gray-400 leading-tight">you owe</div>
                  <div className="text-sm font-bold text-red-500">
                    {formatBalance(netBalance!, currency!)}
                  </div>
                </div>
              )}
            </div>
          )}
          <ChevronRight size={16} className="text-gray-300" />
        </div>
      </div>
    </Link>
  )
}
