import { clsx } from 'clsx'
import { Check } from 'lucide-react'
import type { Profile } from '@/types'

interface PersonCardProps {
  profile: Profile
  selected?: boolean
  onToggle?: (userId: string) => void
  badge?: string
  disabled?: boolean
  size?: 'sm' | 'md'
}

/** Generate a consistent color for a user based on their id */
function avatarColor(userId: string): string {
  const colors = [
    'bg-blue-500', 'bg-violet-500', 'bg-rose-500',
    'bg-amber-500', 'bg-green-500', 'bg-teal-500',
    'bg-orange-500', 'bg-indigo-500',
  ]
  const hash = userId.charCodeAt(0) + userId.charCodeAt(userId.length - 1)
  return colors[hash % colors.length]
}

export function PersonCard({
  profile,
  selected = false,
  onToggle,
  badge,
  disabled = false,
  size = 'md',
}: PersonCardProps) {
  const initials = profile.display_name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const avatarSize = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  const cardPad = size === 'sm' ? 'p-2 gap-2' : 'p-3 gap-2.5'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle?.(profile.id)}
      className={clsx(
        'flex flex-col items-center rounded-xl border transition-all duration-150 select-none',
        cardPad,
        selected
          ? 'border-blue-500 bg-blue-50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {/* Avatar */}
      <div className="relative">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.display_name}
            className={clsx(
              avatarSize,
              'rounded-full object-cover ring-2',
              selected ? 'ring-blue-500' : 'ring-gray-200'
            )}
          />
        ) : (
          <div
            className={clsx(
              avatarSize,
              'rounded-full flex items-center justify-center font-semibold text-white',
              avatarColor(profile.id),
              selected && 'ring-2 ring-blue-500 ring-offset-1'
            )}
          >
            {initials}
          </div>
        )}
        {selected && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
            <Check size={10} className="text-white" strokeWidth={3} />
          </div>
        )}
      </div>

      {/* Name */}
      <span
        className={clsx(
          'text-center leading-tight font-medium',
          size === 'sm' ? 'text-xs max-w-[56px]' : 'text-xs max-w-[64px]',
          selected ? 'text-blue-700' : 'text-gray-700',
          'truncate w-full'
        )}
      >
        {profile.display_name.split(' ')[0]}
      </span>

      {badge && (
        <span className="text-[10px] text-gray-400">{badge}</span>
      )}
    </button>
  )
}

/** Grid of person cards */
export function PersonCardGrid({
  profiles,
  selected,
  onToggle,
  singleSelect = false,
}: {
  profiles: Profile[]
  selected: string[]
  onToggle: (userId: string) => void
  singleSelect?: boolean
}) {
  const handleToggle = (userId: string) => {
    if (singleSelect) {
      onToggle(userId)
    } else {
      onToggle(userId)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {profiles.map(p => (
        <PersonCard
          key={p.id}
          profile={p}
          selected={selected.includes(p.id)}
          onToggle={handleToggle}
        />
      ))}
    </div>
  )
}
