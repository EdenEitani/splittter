import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Pause, Play, Trash2, RefreshCw } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { useGroup } from '@/hooks/useGroups'
import {
  useRecurringExpenses,
  useDeleteRecurringExpense,
  useToggleRecurringExpense,
} from '@/hooks/useRecurringExpenses'
import { formatMoney, fromMinorUnits } from '@/lib/money'
import { clsx } from 'clsx'
import type { RecurrenceFrequency } from '@/types'

const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  daily:   'Daily',
  weekly:  'Weekly',
  monthly: 'Monthly',
  yearly:  'Yearly',
}

const FREQUENCY_COLORS: Record<RecurrenceFrequency, string> = {
  daily:   'bg-purple-100 text-purple-700',
  weekly:  'bg-blue-100 text-blue-700',
  monthly: 'bg-green-100 text-green-700',
  yearly:  'bg-orange-100 text-orange-700',
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function RecurringExpensesPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const { data: group } = useGroup(groupId!)
  const { data: recurring, isLoading } = useRecurringExpenses(groupId!)
  const deleteRecurring = useDeleteRecurringExpense(groupId!)
  const toggleRecurring = useToggleRecurringExpense(groupId!)

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  return (
    <Layout
      title="Recurring Expenses"
      showBack
      backTo={`/group/${groupId}`}
    >
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : !recurring || recurring.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">
            <RefreshCw size={48} className="mx-auto text-gray-200" />
          </div>
          <p className="text-gray-500 text-sm font-medium">No recurring expenses</p>
          <p className="text-gray-400 text-xs mt-1">
            Toggle "Repeat" when adding an expense to set one up.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {recurring.map(re => {
            const amount = fromMinorUnits(re.original_amount, re.original_currency)
            const formatted = formatMoney(re.original_amount, re.original_currency)

            return (
              <div
                key={re.id}
                className={clsx(
                  'bg-white rounded-2xl border shadow-sm p-4 transition-opacity',
                  re.active ? 'border-gray-100' : 'border-gray-100 opacity-60'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Category icon or default */}
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">
                    {re.category?.icon ?? '🔄'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">{re.label}</p>
                      <span className={clsx(
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                        FREQUENCY_COLORS[re.frequency]
                      )}>
                        {FREQUENCY_LABELS[re.frequency]}
                      </span>
                      {!re.active && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          Paused
                        </span>
                      )}
                    </div>
                    <p className="text-base font-bold text-gray-900 mt-0.5">{formatted}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {re.active
                        ? `Next: ${formatDate(re.next_due_date)}`
                        : `Paused · was due ${formatDate(re.next_due_date)}`}
                    </p>
                    {re.notes && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{re.notes}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleRecurring.mutate({ id: re.id, active: !re.active })}
                      disabled={toggleRecurring.isPending}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
                      title={re.active ? 'Pause' : 'Resume'}
                    >
                      {re.active ? <Pause size={15} /> : <Play size={15} />}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(re.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Inline delete confirm */}
                {confirmDeleteId === re.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-600">Delete this recurring expense?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          deleteRecurring.mutate(re.id)
                          setConfirmDeleteId(null)
                        }}
                        disabled={deleteRecurring.isPending}
                        className="text-xs text-white bg-red-500 hover:bg-red-600 font-medium px-3 py-1.5 rounded-lg"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
