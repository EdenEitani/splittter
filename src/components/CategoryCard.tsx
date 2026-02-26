import { clsx } from 'clsx'
import type { Category } from '@/types'

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  blue:   { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-400' },
  green:  { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-400' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-400' },
  red:    { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-400' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-400' },
  pink:   { bg: 'bg-pink-100',   text: 'text-pink-700',   border: 'border-pink-400' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-400' },
  teal:   { bg: 'bg-teal-100',   text: 'text-teal-700',   border: 'border-teal-400' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-400' },
  gray:   { bg: 'bg-gray-100',   text: 'text-gray-700',   border: 'border-gray-400' },
}

interface CategoryCardProps {
  category: Category
  selected?: boolean
  suggested?: boolean
  confidence?: number
  onSelect?: (id: string) => void
}

export function CategoryCard({
  category,
  selected = false,
  suggested = false,
  confidence,
  onSelect,
}: CategoryCardProps) {
  const colors = COLOR_MAP[category.color_token] ?? COLOR_MAP.gray

  return (
    <button
      type="button"
      onClick={() => onSelect?.(category.id)}
      className={clsx(
        'relative flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all duration-150 min-w-[64px]',
        'select-none cursor-pointer',
        selected
          ? `${colors.border} ${colors.bg}`
          : suggested
          ? 'border-dashed border-blue-300 bg-blue-50'
          : 'border-transparent bg-gray-50 hover:bg-gray-100'
      )}
    >
      {/* Suggested glow */}
      {suggested && !selected && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white" />
      )}

      {/* Icon */}
      <span className="text-2xl leading-none">{category.icon}</span>

      {/* Label */}
      <span
        className={clsx(
          'text-[10px] font-medium text-center leading-tight',
          selected ? colors.text : 'text-gray-600'
        )}
      >
        {category.name}
      </span>

      {/* Confidence bar */}
      {suggested && confidence !== undefined && (
        <div className="absolute bottom-1 left-2 right-2 h-0.5 bg-blue-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${Math.round(confidence * 100)}%` }}
          />
        </div>
      )}
    </button>
  )
}

/** Scrollable grid of category cards */
export function CategoryGrid({
  categories,
  selectedId,
  suggestedId,
  confidence,
  onSelect,
}: {
  categories: Category[]
  selectedId: string | null
  suggestedId?: string | null
  confidence?: number
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map(cat => (
        <CategoryCard
          key={cat.id}
          category={cat}
          selected={selectedId === cat.id}
          suggested={suggestedId === cat.id && selectedId !== cat.id}
          confidence={suggestedId === cat.id ? confidence : undefined}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
