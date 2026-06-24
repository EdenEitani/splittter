import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Receipt, CreditCard, Users, Settings, RefreshCw, Search, X, Download, Plus } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { ExpenseItem } from '@/components/ExpenseItem'
import { PaymentItem } from '@/components/PaymentItem'
import { BalanceSummary } from '@/components/BalanceSummary'
import { useGroup, useGroupMembers } from '@/hooks/useGroups'
import { useExpenses, useDeleteExpense } from '@/hooks/useExpenses'
import { usePayments, useDeletePayment } from '@/hooks/usePayments'
import { computeBalances } from '@/lib/balance'
import { fromMinorUnits } from '@/lib/money'
import { useAuth } from '@/hooks/useAuth'
import { todayISO } from '@/lib/fx'
import { useRecurringExpenses, useGenerateDueExpenses } from '@/hooks/useRecurringExpenses'
import { clsx } from 'clsx'
import type { ActivityItem } from '@/types'

type Tab = 'activity' | 'balances' | 'members'

export function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('activity')
  const [searchQuery, setSearchQuery] = useState('')
  const [fabOpen, setFabOpen] = useState(false)

  // Undo-delete state
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingDeleteRef = useRef<{ id: string; type: 'expense' | 'payment' } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{
    id: string; type: 'expense' | 'payment'; label: string
  } | null>(null)

  const { user } = useAuth()
  const { data: group, isLoading: loadingGroup } = useGroup(groupId!)
  const { data: members, isLoading: loadingMembers } = useGroupMembers(groupId!)
  const { data: expenses, isLoading: loadingExpenses } = useExpenses(groupId!)
  const { data: payments, isLoading: loadingPayments } = usePayments(groupId!)
  const { data: recurring } = useRecurringExpenses(groupId!)
  const deleteExpense = useDeleteExpense(groupId!)
  const deletePayment = useDeletePayment(groupId!)
  const generateDue = useGenerateDueExpenses(groupId!, group?.base_currency ?? 'USD')
  const hasGenerated = useRef(false)

  // Auto-generate overdue recurring expenses (creator only, once per mount)
  useEffect(() => {
    if (!recurring || !user || !group || hasGenerated.current) return
    const today = todayISO()
    const due = recurring.filter(r => r.active && r.next_due_date <= today)
    if (due.length > 0) {
      hasGenerated.current = true
      generateDue.mutate({ dueExpenses: due, userId: user.id })
    }
  }, [recurring, user, group])

  const activeRecurringCount = (recurring ?? []).filter(r => r.active).length

  function scheduleDeletion(id: string, type: 'expense' | 'payment', label: string) {
    // Flush any previous pending delete immediately
    if (pendingDeleteRef.current && deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current)
      const prev = pendingDeleteRef.current
      if (prev.type === 'expense') deleteExpense.mutate(prev.id)
      else deletePayment.mutate(prev.id)
    }
    pendingDeleteRef.current = { id, type }
    setPendingDelete({ id, type, label })
    deleteTimerRef.current = setTimeout(() => {
      if (type === 'expense') deleteExpense.mutate(id)
      else deletePayment.mutate(id)
      pendingDeleteRef.current = null
      setPendingDelete(null)
      deleteTimerRef.current = null
    }, 5000)
  }

  function handleUndo() {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    deleteTimerRef.current = null
    pendingDeleteRef.current = null
    setPendingDelete(null)
  }

  function handleExportCSV() {
    if (!group) return
    const rows: string[][] = []
    rows.push([
      'date', 'type', 'description', 'category',
      'original_amount', 'original_currency',
      'group_amount', 'group_currency',
      'fx_rate', 'fx_date',
      'paid_by', 'paid_to', 'split_details', 'notes',
    ])
    const allItems = [
      ...(expenses ?? []).map(e => ({ kind: 'expense' as const, item: e })),
      ...(payments ?? []).map(p => ({ kind: 'payment' as const, item: p })),
    ].sort((a, b) => a.item.occurred_at.localeCompare(b.item.occurred_at))

    for (const { kind, item } of allItems) {
      if (kind === 'expense') {
        const e = item
        const payers = (e.participants ?? []).filter(p => p.role === 'payer')
        const participants = (e.participants ?? []).filter(p => p.role === 'participant')
        const paidBy = payers.map(p => {
          const name = p.profile?.display_name ?? p.user_id
          if (payers.length > 1 && p.share_amount_group_currency != null)
            return `${name} (${fromMinorUnits(p.share_amount_group_currency, e.group_currency).toFixed(2)})`
          return name
        }).join('; ')
        const splitDetails = participants.map(p => {
          const name = p.profile?.display_name ?? p.user_id
          if (p.share_amount_group_currency != null)
            return `${name}: ${fromMinorUnits(p.share_amount_group_currency, e.group_currency).toFixed(2)} ${e.group_currency}`
          return name
        }).join('; ')
        rows.push([
          e.occurred_at.slice(0, 10),
          'expense',
          e.label,
          e.category?.name ?? '',
          fromMinorUnits(e.original_amount, e.original_currency).toFixed(2),
          e.original_currency,
          fromMinorUnits(e.group_amount, e.group_currency).toFixed(2),
          e.group_currency,
          e.fx_rate === 1 ? '1' : e.fx_rate.toFixed(6),
          e.fx_date,
          paidBy,
          '',
          splitDetails,
          e.notes ?? '',
        ])
      } else {
        const p = item
        rows.push([
          p.occurred_at.slice(0, 10),
          'payment',
          `${p.from_profile?.display_name ?? ''} to ${p.to_profile?.display_name ?? ''}`,
          '',
          fromMinorUnits(p.original_amount, p.original_currency).toFixed(2),
          p.original_currency,
          fromMinorUnits(p.group_amount, p.group_currency).toFixed(2),
          p.group_currency,
          p.fx_rate === 1 ? '1' : p.fx_rate.toFixed(6),
          p.fx_date,
          p.from_profile?.display_name ?? '',
          p.to_profile?.display_name ?? '',
          '',
          p.notes ?? '',
        ])
      }
    }

    const csv = rows.map(row =>
      row.map(cell => {
        const s = String(cell)
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s
      }).join(',')
    ).join('\n')

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${group.name}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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

  const q = searchQuery.toLowerCase().trim()
  const visibleActivity = activity
    .filter(item => item.data.id !== pendingDelete?.id)
    .filter(item => {
      if (!q) return true
      if (item.kind === 'expense') return item.data.label.toLowerCase().includes(q)
      const from = (item.data as typeof item.data & { from_profile?: { display_name?: string } }).from_profile?.display_name?.toLowerCase() ?? ''
      const to = (item.data as typeof item.data & { to_profile?: { display_name?: string } }).to_profile?.display_name?.toLowerCase() ?? ''
      return from.includes(q) || to.includes(q)
    })

  const loading = loadingExpenses || loadingPayments || loadingMembers

  return (
    <Layout
      title={group.name}
      showBack
      backTo="/"
      noPad
      headerRight={
        <div className="flex items-center gap-1">
          <button
            onClick={handleExportCSV}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500"
            title="Export CSV"
          >
            <Download size={18} />
          </button>
          <Link
            to={`/group/${groupId}/settings`}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500"
            title="Group settings"
          >
            <Settings size={18} />
          </Link>
        </div>
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
            {/* Search bar */}
            {!loading && activity.length > 0 && (
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search expenses & payments…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-9 pr-8 text-base border border-gray-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

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
            ) : visibleActivity.length === 0 && q ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-sm">No results for "{searchQuery}"</p>
              </div>
            ) : (
              visibleActivity.map(item =>
                item.kind === 'expense' ? (
                  <ExpenseItem
                    key={item.data.id}
                    expense={item.data}
                    currentUserId={user?.id}
                    onDelete={id => scheduleDeletion(id, 'expense', item.data.label)}
                    onEdit={id => navigate(`/group/${groupId}/edit-expense/${id}`)}
                  />
                ) : (
                  <PaymentItem
                    key={item.data.id}
                    payment={item.data}
                    currentUserId={user?.id}
                    onDelete={id => {
                      const p = item.data
                      const label = `${p.from_profile?.display_name?.split(' ')[0] ?? '?'} → ${p.to_profile?.display_name?.split(' ')[0] ?? '?'}`
                      scheduleDeletion(id, 'payment', label)
                    }}
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
            payments={payments ?? []}
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

      {/* Undo delete toast */}
      {pendingDelete && (
        <div className="fixed bottom-36 md:bottom-24 left-4 right-4 md:left-auto md:right-6 md:w-80 z-50 animate-in slide-in-from-bottom-2">
          <div className="bg-gray-900 text-white rounded-2xl px-4 py-3 flex items-center justify-between shadow-xl">
            <p className="text-sm truncate flex-1">
              Deleted <span className="font-semibold">"{pendingDelete.label}"</span>
            </p>
            <button
              onClick={handleUndo}
              className="ml-3 text-sm font-bold text-blue-300 hover:text-blue-200 flex-shrink-0 transition-colors"
            >
              Undo
            </button>
          </div>
        </div>
      )}

      {/* FAB backdrop */}
      {fabOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setFabOpen(false)} />
      )}

      {/* FABs */}
      <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50">
        <div className="flex flex-col items-end gap-2.5">
          {/* Sub-actions */}
          <div className={clsx(
            'flex flex-col items-end gap-2 transition-all duration-200 origin-bottom',
            fabOpen ? 'opacity-100 pointer-events-auto translate-y-0' : 'opacity-0 pointer-events-none translate-y-2'
          )}>
            {/* Recurring */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-800 bg-white px-3 py-1.5 rounded-lg shadow-md border border-gray-100 whitespace-nowrap">
                Recurring{activeRecurringCount > 0 && (
                  <span className="ml-1.5 bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {activeRecurringCount}
                  </span>
                )}
              </span>
              <Link
                to={`/group/${groupId}/recurring`}
                className="w-11 h-11 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors flex-shrink-0"
                onClick={() => setFabOpen(false)}
              >
                <RefreshCw size={17} />
              </Link>
            </div>
            {/* Settle up */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-800 bg-white px-3 py-1.5 rounded-lg shadow-md border border-gray-100 whitespace-nowrap">
                Settle up
              </span>
              <Link
                to={`/group/${groupId}/add-payment`}
                className="w-11 h-11 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-green-600 hover:bg-gray-50 transition-colors flex-shrink-0"
                onClick={() => setFabOpen(false)}
              >
                <CreditCard size={17} />
              </Link>
            </div>
          </div>

          {/* Bottom row: secondary circle + primary */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setFabOpen(o => !o)}
              className={clsx(
                'w-11 h-11 rounded-full border shadow-md flex items-center justify-center transition-all duration-200',
                fabOpen
                  ? 'bg-gray-800 border-gray-700 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              )}
            >
              <Plus
                size={20}
                className={clsx('transition-transform duration-200', fabOpen && 'rotate-45')}
              />
            </button>
            <Link
              to={`/group/${groupId}/add-expense`}
              className="flex items-center gap-2 bg-blue-600 text-white shadow-lg px-5 h-12 rounded-full font-semibold text-base hover:bg-blue-700 transition-colors"
            >
              <Receipt size={20} />
              Add expense
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  )
}
