import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Layout } from '@/components/Layout'
import { useAllActivity } from '@/hooks/useActivity'
import { useAuth } from '@/hooks/useAuth'
import { formatMoney } from '@/lib/money'
import type { Expense, Payment } from '@/types'

export function NotificationsPage() {
  const { data: activity, isLoading } = useAllActivity(50)
  const { user } = useAuth()

  return (
    <Layout title="Activity">
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : !activity?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">🔔</div>
          <h2 className="text-lg font-semibold text-gray-700">No activity yet</h2>
          <p className="text-sm text-gray-400 mt-1">Add expenses in your groups to see activity here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activity.map((item, idx) =>
            item.kind === 'expense' ? (
              <ActivityExpenseRow
                key={`e-${item.data.id}-${idx}`}
                expense={item.data as Expense & { group?: { id: string; name: string } }}
                currentUserId={user?.id}
              />
            ) : (
              <ActivityPaymentRow
                key={`p-${item.data.id}-${idx}`}
                payment={item.data as Payment & { group?: { id: string; name: string } }}
                currentUserId={user?.id}
              />
            )
          )}
        </div>
      )}
    </Layout>
  )
}

function ActivityExpenseRow({
  expense,
  currentUserId,
}: {
  expense: Expense & { group?: { id: string; name: string } }
  currentUserId?: string
}) {
  const payers = (expense.participants ?? []).filter(p => p.role === 'payer')
  const payerName = payers[0]?.profile?.display_name ?? '?'
  const isYou = payers[0]?.user_id === currentUserId

  const myShare = (expense.participants ?? []).find(
    p => p.user_id === currentUserId && p.role === 'participant'
  )

  const groupId = (expense as { group?: { id: string; name: string } }).group?.id ?? expense.group_id
  const groupName = (expense as { group?: { id: string; name: string } }).group?.name ?? 'Group'

  return (
    <Link
      to={`/group/${groupId}`}
      className="block bg-white rounded-2xl border border-gray-100 p-3.5 hover:shadow-md hover:border-gray-200 transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-xl flex-shrink-0">
          {expense.category?.icon ?? '💸'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{expense.label}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {isYou ? 'You' : payerName} paid · {groupName} · {format(new Date(expense.occurred_at), 'MMM d')}
          </p>
          {myShare && (
            <p className="text-xs text-red-500 mt-0.5 font-medium">
              Your share: {formatMoney(myShare.share_amount_group_currency ?? 0, expense.group_currency)}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="font-semibold text-gray-900">
            {formatMoney(expense.original_amount, expense.original_currency)}
          </p>
        </div>
      </div>
    </Link>
  )
}

function ActivityPaymentRow({
  payment,
  currentUserId,
}: {
  payment: Payment & { group?: { id: string; name: string } }
  currentUserId?: string
}) {
  const isFrom = payment.from_user_id === currentUserId
  const isTo = payment.to_user_id === currentUserId

  const fromName = payment.from_profile?.display_name ?? '?'
  const toName = payment.to_profile?.display_name ?? '?'

  const groupId = (payment as { group?: { id: string; name: string } }).group?.id ?? payment.group_id
  const groupName = (payment as { group?: { id: string; name: string } }).group?.name ?? 'Group'

  let description = `${fromName} → ${toName}`
  if (isFrom) description = `You paid ${toName}`
  else if (isTo) description = `${fromName} paid you`

  return (
    <Link
      to={`/group/${groupId}`}
      className="block bg-white rounded-2xl border border-gray-100 p-3.5 hover:shadow-md hover:border-gray-200 transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-xl flex-shrink-0">
          💸
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{description}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Settlement · {groupName} · {format(new Date(payment.occurred_at), 'MMM d')}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className={`font-semibold ${isTo ? 'text-green-600' : 'text-gray-900'}`}>
            {isTo ? '+' : ''}{formatMoney(payment.original_amount, payment.original_currency)}
          </p>
        </div>
      </div>
    </Link>
  )
}
