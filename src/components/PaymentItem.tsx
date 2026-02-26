import { ArrowRight } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import type { Payment } from '@/types'
import { format } from 'date-fns'

interface PaymentItemProps {
  payment: Payment
  currentUserId?: string
  onDelete?: (id: string) => void
}

export function PaymentItem({ payment, currentUserId, onDelete }: PaymentItemProps) {
  const fromName = payment.from_profile?.display_name?.split(' ')[0] ?? '…'
  const toName = payment.to_profile?.display_name?.split(' ')[0] ?? '…'
  const canDelete = currentUserId === payment.created_by
  const isSame = payment.original_currency === payment.group_currency

  return (
    <div className="bg-green-50 rounded-2xl border border-green-100 p-3.5 flex gap-3 items-center shadow-sm">
      {/* Settlement icon */}
      <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
        <span className="text-xl">💸</span>
      </div>

      {/* Direction */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-gray-900 text-sm">{fromName}</span>
          <ArrowRight size={14} className="text-green-600 flex-shrink-0" />
          <span className="font-medium text-gray-900 text-sm">{toName}</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          Settlement · {format(new Date(payment.occurred_at), 'MMM d')}
        </p>
        {payment.notes && (
          <p className="text-xs text-gray-500 mt-0.5 italic">{payment.notes}</p>
        )}
      </div>

      {/* Amount */}
      <div className="flex-shrink-0 text-right">
        <p className="font-semibold text-green-700">
          {formatMoney(payment.original_amount, payment.original_currency)}
        </p>
        {!isSame && (
          <p className="text-xs text-gray-400">
            ≈ {formatMoney(payment.group_amount, payment.group_currency)}
          </p>
        )}
      </div>

      {/* Delete */}
      {canDelete && onDelete && (
        <button
          onClick={() => onDelete(payment.id)}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
          title="Delete payment"
        >
          ×
        </button>
      )}
    </div>
  )
}
