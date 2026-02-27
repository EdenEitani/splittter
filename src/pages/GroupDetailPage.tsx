import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Receipt, CreditCard, Users, Settings } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { ExpenseItem } from '@/components/ExpenseItem'
import { PaymentItem } from '@/components/PaymentItem'
import { BalanceSummary } from '@/components/BalanceSummary'
import { useGroup, useGroupMembers } from '@/hooks/useGroups'
import { useExpenses, useDeleteExpense } from '@/hooks/useExpenses'
import { usePayments, useDeletePayment } from '@/hooks/usePayments'
import { computeBalances } from '@/lib/balance'
import { useAuth } from '@/hooks/useAuth'
import { clsx } from 'clsx'
import type { ActivityItem } from '@/types'

type Tab = 'activity' | 'balances' | 'members'

export function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('activity')

  const { user } = useAuth()
  const { data: group, isLoading: loadingGroup } = useGroup(groupId!)
  const { data: members, isLoading: loadingMembers } = useGroupMembers(groupId!)
  const { data: expenses, isLoading: loadingExpenses } = useExpenses(groupId!)
  const { data: payments, isLoading: loadingPayments } = usePayments(groupId!)
  const deleteExpense = useDeleteExpense(groupId!)
  const deletePayment = useDeletePayment(groupId!)

  if (loadingGroup) {
    return (
      <Layout showBack title="Loading…">
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </Layout>
    )
  }

  if (!group) {
    return (
      <Layout showBack title="Not found">
        <p className="text-gray-500 text-sm">Group not found.</p>
      </Layout>
    )
  }

  const memberProfiles = (members ?? []).map(m => ({
    user_id: m.user_id,
    profile: m.profile!,
  }))

  const balances = computeBalances(
    expenses ?? [],
    payments ?? [],
    memberProfiles,
    group.base_currency
  )

  const activity: ActivityItem[] = [
    ...(expenses ?? []).map(e => ({ kind: 'expense' as const, data: e })),
    ...(payments ?? []).map(p => ({ kind: 'payment' as const, data: p })),
  ].sort((a, b) => b.data.occurred_at.localeCompare(a.data.occurred_at))

  const loading = loadingExpenses || loadingPayments || loadingMembers

  return (
    <Layout
      title={group.name}
      showBack
      backTo="/"
      noPad
      headerRight={
        <Link
          to={`/group/${groupId}/settings`}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500"
          title="Group settings"
        >
          <Settings size={18} />
        </Link>
      }
    >
      {/* Tab bar */}
      <div className="flex bg-white border-b border-gray-100 sticky top-14 md:top-16 z-30">
        {(['activity', 'balances', 'members'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'flex-1 py-3 text-sm font-medium capitalize transition-colors border-b-2',
              tab === t
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-4 md:p-6 pb-28">
        {/* Activity tab */}
        {tab === 'activity' && (
          <div className="space-y-2.5">
            {loading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
              ))
            ) : activity.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">📋</div>
                <p className="text-gray-500 text-sm">No activity yet</p>
                <p className="text-gray-400 text-xs mt-1">Add an expense to get started</p>
              </div>
            ) : (
              activity.map(item =>
                item.kind === 'expense' ? (
                  <ExpenseItem
                    key={item.data.id}
                    expense={item.data}
                    currentUserId={user?.id}
                    onDelete={id => deleteExpense.mutate(id)}
                    onEdit={id => navigate(`/group/${groupId}/edit-expense/${id}`)}
                  />
                ) : (
                  <PaymentItem
                    key={item.data.id}
                    payment={item.data}
                    currentUserId={user?.id}
                    onDelete={id => deletePayment.mutate(id)}
                  />
                )
              )
            )}
          </div>
        )}

        {/* Balances tab */}
        {tab === 'balances' && (
          <BalanceSummary
            balances={balances}
            currency={group.base_currency}
            currentUserId={user?.id}
            expenses={expenses ?? []}
            onSettle={(from, to) => {
              window.location.href = `/group/${groupId}/add-payment?from=${from}&to=${to}`
            }}
          />
        )}

        {/* Members tab */}
        {tab === 'members' && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              {(members ?? []).map(m => (
                <div
                  key={m.user_id}
                  className="px-4 py-3 flex items-center gap-3 border-b border-gray-50 last:border-0"
                >
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm">
                    {m.profile?.display_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {m.profile?.display_name}
                      {m.user_id === user?.id && (
                        <span className="text-gray-400 font-normal"> (you)</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 capitalize">{m.role}</p>
                  </div>
                </div>
              ))}
            </div>

            <Link
              to={`/group/${groupId}/settings`}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium px-1"
            >
              <Users size={16} />
              Manage members & settings
            </Link>
          </div>
        )}
      </div>

      {/* FABs */}
      <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 flex flex-col gap-3 z-50">
        <Link
          to={`/group/${groupId}/add-payment`}
          className="flex items-center gap-2 bg-white text-gray-700 border border-gray-200 shadow-md px-4 h-11 rounded-full font-medium text-sm hover:bg-gray-50 transition-colors"
        >
          <CreditCard size={18} className="text-green-600" />
          Settle up
        </Link>
        <Link
          to={`/group/${groupId}/add-expense`}
          className="flex items-center gap-2 bg-blue-600 text-white shadow-lg px-5 h-12 rounded-full font-semibold text-base hover:bg-blue-700 transition-colors"
        >
          <Receipt size={20} />
          Add expense
        </Link>
      </div>
    </Layout>
  )
}
