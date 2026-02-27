import { Pencil } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import type { Expense } from '@/types'
import { format } from 'date-fns'

interface ExpenseItemProps {
  expense: Expense
  currentUserId?: string
  onDelete?: (id: string) => void
  onEdit?: (id: string) => void
}

export function ExpenseItem({ expense, currentUserId, onDelete, onEdit }: ExpenseItemProps) {
  const participants = expense.participants ?? []
  const payers = participants.filter(p => p.role === 'payer')
  const payerNames = payers
    .map(p => p.profile?.display_name?.split(' ')[0] ?? '…')
    .join(', ')
  const debtors = participants.filter(p => p.role === 'participant' && p.share_amount_group_currency)

  const isSameAmount = expense.original_currency === expense.group_currency
  const canDelete = currentUserId === expense.created_by

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="h-1 bg-blue-400" />
      <div className="p-4 flex gap-3 items-start">
        {/* Category icon */}
        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-xl flex-shrink-0">
          {expense.category?.icon ?? '💸'}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{expense.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {expense.category?.name ?? 'Uncategorized'}
                {' · '}
                {payerNames} paid
                {' · '}
                {format(new Date(expense.occurred_at), 'MMM d')}
              </p>
            </div>
            <div className="flex-shrink-0 text-right">
              <p className="text-base font-bold text-gray-900">
                {formatMoney(expense.original_amount, expense.original_currency)}
              </p>
              {!isSameAmount && (
                <p className="text-xs text-gray-400">
                  ≈ {formatMoney(expense.group_amount, expense.group_currency)}
                </p>
              )}
            </div>
          </div>

          {expense.category_confidence !== null && expense.category_confidence < 0.7 && (
            <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md">
              <span>⚠</span>
              <span>{Math.round((expense.category_confidence ?? 0) * 100)}% confident</span>
            </div>
          )}

          {debtors.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-50 flex flex-wrap gap-x-3 gap-y-1.5">
              {debtors.map(p => {
                const name = p.profile?.display_name ?? '?'
                const initial = name[0].toUpperCase()
                return (
                  <div key={p.user_id} className="flex items-center gap-1" title={name}>
                    <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[9px] font-bold text-blue-500 flex-shrink-0">
                      {initial}
                    </div>
                    <span className="text-[11px] text-gray-400 font-medium">
                      {formatMoney(p.share_amount_group_currency!, expense.group_currency)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        {canDelete && (
          <div className="flex-shrink-0 flex flex-col gap-1">
            {onEdit && (
              <button
                onClick={() => onEdit(expense.id)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-blue-50 text-gray-300 hover:text-blue-400 transition-colors"
                title="Edit expense"
              >
                <Pencil size={13} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(expense.id)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
                title="Delete expense"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
