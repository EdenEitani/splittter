import { Link } from 'react-router-dom'
import { Plane, Home, Calendar, Building2, Sparkles, Users } from 'lucide-react'
import { clsx } from 'clsx'
import type { GroupWithMembers, Profile } from '@/types'
import { formatMoney } from '@/lib/money'

const GROUP_ICONS = {
  trip: Plane,
  house: Home,
  event: Calendar,
  roommates: Building2,
  custom: Sparkles,
}

const GROUP_ICON_COLORS = {
  trip: 'bg-sky-100 text-sky-600',
  house: 'bg-emerald-100 text-emerald-600',
  event: 'bg-violet-100 text-violet-600',
  roommates: 'bg-amber-100 text-amber-600',
  custom: 'bg-blue-100 text-blue-600',
}

const AVATAR_COLORS = [
  'bg-violet-400',
  'bg-blue-500',
  'bg-pink-500',
  'bg-amber-400',
  'bg-emerald-500',
  'bg-sky-500',
  'bg-rose-500',
  'bg-teal-500',
]

interface GroupCardProps {
  group: GroupWithMembers
  netBalance?: number
  currency?: string
}

function MemberAvatars({ profiles }: { profiles: Profile[] }) {
  const shown = profiles.slice(0, 4)
  const extra = profiles.length - 4
  return (
    <div className="flex -space-x-2">
      {shown.map((p, i) => (
        <div
          key={p.id ?? i}
          className={clsx(
            'w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0',
            AVATAR_COLORS[i % AVATAR_COLORS.length]
          )}
          title={p.display_name}
        >
          {p.display_name.slice(0, 2).toUpperCase()}
        </div>
      ))}
      {extra > 0 && (
        <div className="w-7 h-7 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500">
          +{extra}
        </div>
      )}
    </div>
  )
}

export function GroupCard({ group, netBalance, currency }: GroupCardProps) {
  const Icon = GROUP_ICONS[group.type] ?? Users
  const iconColor = GROUP_ICON_COLORS[group.type] ?? GROUP_ICON_COLORS.custom

  const members = group.members ?? []
  const profiles = members.map(m => m.profile).filter(Boolean) as Profile[]

  const showBalance = netBalance !== undefined && currency
  const isOwed = (netBalance ?? 0) > 0
  const isOwe = (netBalance ?? 0) < 0
  const isSettled = netBalance === 0

  return (
    <Link
      to={`/group/${group.id}`}
      className="block bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 p-5"
    >
      {/* Icon/emoji + name + status badge */}
      <div className="flex items-center gap-3 mb-4">
        {group.emoji ? (
          <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 text-2xl">
            {group.emoji}
          </div>
        ) : (
          <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', iconColor)}>
            <Icon size={22} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-lg leading-tight truncate">{group.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </p>
        </div>
        {showBalance && (
          <span
            className={clsx(
              'text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0',
              isOwed && 'bg-emerald-100 text-emerald-700',
              isOwe && 'bg-red-100 text-red-600',
              isSettled && 'bg-gray-100 text-gray-500',
            )}
          >
            {isOwed ? "You're owed" : isOwe ? 'You owe' : 'Settled up'}
          </span>
        )}
      </div>

      {/* Balance row */}
      {showBalance && (
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
              Your balance
            </p>
            <p
              className={clsx(
                'text-2xl font-bold',
                isOwed ? 'text-emerald-500' : isOwe ? 'text-red-500' : 'text-gray-400',
              )}
            >
              {netBalance === 0
                ? '—'
                : `${isOwed ? '+' : '-'}${formatMoney(Math.abs(netBalance!), currency!)}`}
            </p>
          </div>
        </div>
      )}

      {/* Avatars */}
      {profiles.length > 0 && <MemberAvatars profiles={profiles} />}
    </Link>
  )
}
