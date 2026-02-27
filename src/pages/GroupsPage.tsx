import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Upload } from 'lucide-react'
import { useGroups, useUserGroupsBalance } from '@/hooks/useGroups'
import { usePeopleBalances } from '@/hooks/useBalances'
import { GroupCard } from '@/components/GroupCard'
import { PeopleBalances } from '@/components/PeopleBalances'
import { Layout } from '@/components/Layout'
import { ImportGroupModal } from '@/components/ImportGroupModal'
import { useAuth } from '@/hooks/useAuth'
import { formatMoney } from '@/lib/money'
import type { GroupWithMembers } from '@/types'

export function GroupsPage() {
  const { data: groups, isLoading } = useGroups()
  const { user } = useAuth()
  const { data: balanceMap } = useUserGroupsBalance(user?.id)
  const { data: peopleBalances, isLoading: loadingPeople } = usePeopleBalances(user?.id)
  const [showImport, setShowImport] = useState(false)

  // Aggregate totals across all groups by dominant currency
  const totals: Record<string, { owe: number; owed: number }> = {}
  if (balanceMap) {
    for (const b of Object.values(balanceMap)) {
      if (!totals[b.currency]) totals[b.currency] = { owe: 0, owed: 0 }
      if (b.net < 0) totals[b.currency].owe += -b.net
      else if (b.net > 0) totals[b.currency].owed += b.net
    }
  }

  const dominantCurrency = Object.entries(totals).sort(
    (a, b) => b[1].owe + b[1].owed - (a[1].owe + a[1].owed),
  )[0]

  const totalOwe = dominantCurrency ? dominantCurrency[1].owe : 0
  const totalOwed = dominantCurrency ? dominantCurrency[1].owed : 0
  const summCurrency = dominantCurrency?.[0] ?? 'USD'
  const net = totalOwed - totalOwe

  const owedGroups = Object.values(balanceMap ?? {}).filter(b => b.net > 0).length
  const oweGroups = Object.values(balanceMap ?? {}).filter(b => b.net < 0).length

  const hasGroups = !isLoading && (groups?.length ?? 0) > 0

  return (
    <Layout
      title="Dashboard"
      headerRight={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="hidden md:flex items-center gap-1.5 text-sm font-medium text-gray-600 border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Upload size={15} />
            Import CSV
          </button>
          <Link
            to="/create-group"
            className="hidden md:flex items-center gap-1.5 text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors"
          >
            + New Group
          </Link>
          {/* Mobile buttons */}
          <button
            onClick={() => setShowImport(true)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            title="Import CSV"
          >
            <Upload size={18} />
          </button>
          <Link
            to="/create-group"
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
          </Link>
        </div>
      }
    >
      {/* ── Balance summary cards ─────────────────────────────── */}
      {hasGroups && (
        <div className="mb-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* You are owed */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="h-1 bg-emerald-400" />
            <div className="p-5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
                You are owed
              </p>
              <p className="text-2xl font-bold text-emerald-500">
                {totalOwed > 0 ? formatMoney(totalOwed, summCurrency) : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {owedGroups > 0
                  ? `across ${owedGroups} group${owedGroups !== 1 ? 's' : ''}`
                  : 'nothing owed yet'}
              </p>
            </div>
          </div>

          {/* You owe */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="h-1 bg-rose-400" />
            <div className="p-5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
                You owe
              </p>
              <p className="text-2xl font-bold text-rose-500">
                {totalOwe > 0 ? formatMoney(totalOwe, summCurrency) : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {oweGroups > 0
                  ? `across ${oweGroups} group${oweGroups !== 1 ? 's' : ''}`
                  : 'nothing to pay'}
              </p>
            </div>
          </div>

          {/* Net balance */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className={`h-1 ${net >= 0 ? 'bg-blue-400' : 'bg-orange-400'}`} />
            <div className="p-5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
                Net balance
              </p>
              <p
                className={`text-2xl font-bold ${
                  net > 0
                    ? 'text-blue-500'
                    : net < 0
                      ? 'text-orange-500'
                      : 'text-gray-400'
                }`}
              >
                {totalOwe > 0 || totalOwed > 0
                  ? `${net >= 0 ? '+' : ''}${formatMoney(Math.abs(net), summCurrency)}`
                  : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {net > 0
                  ? "you're in good shape 🎉"
                  : net < 0
                    ? 'you owe overall'
                    : 'all settled up ✨'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── People balances ─────────────────────────────────────── */}
      {hasGroups && (
        <PeopleBalances
          balances={peopleBalances ?? []}
          loading={loadingPeople && !peopleBalances}
        />
      )}

      {/* ── Group list ──────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-52 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : !groups?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center text-4xl mb-5">
            🧾
          </div>
          <h2 className="text-lg font-semibold text-gray-700">No groups yet</h2>
          <p className="text-sm text-gray-400 mt-1 max-w-xs">
            Create a group to start splitting expenses with friends, family, or roommates.
          </p>
          <div className="mt-5 flex flex-col sm:flex-row gap-2">
            <Link
              to="/create-group"
              className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
              Create group
            </Link>
            <button
              onClick={() => setShowImport(true)}
              className="inline-flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-200 px-5 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            >
              <Upload size={18} />
              Import CSV
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Groups</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(groups as GroupWithMembers[]).map(g => {
              const b = balanceMap?.[g.id]
              return (
                <GroupCard
                  key={g.id}
                  group={g}
                  netBalance={b?.net}
                  currency={b?.currency ?? g.base_currency}
                />
              )
            })}
          </div>
        </>
      )}

      {/* FAB – mobile only */}
      {hasGroups && (
        <Link
          to="/create-group"
          className="md:hidden fixed bottom-20 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 transition-colors z-30"
        >
          <Plus size={24} />
        </Link>
      )}

      {showImport && <ImportGroupModal onClose={() => setShowImport(false)} />}
    </Layout>
  )
}
