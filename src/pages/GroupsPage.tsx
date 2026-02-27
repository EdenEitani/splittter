import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Upload, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useGroups, useUserGroupsBalance } from '@/hooks/useGroups'
import { GroupCard } from '@/components/GroupCard'
import { Layout } from '@/components/Layout'
import { ImportGroupModal } from '@/components/ImportGroupModal'
import { useAuth } from '@/hooks/useAuth'
import { formatMoney } from '@/lib/money'

export function GroupsPage() {
  const { data: groups, isLoading } = useGroups()
  const { profile, user } = useAuth()
  const { data: balanceMap } = useUserGroupsBalance(user?.id)
  const [showImport, setShowImport] = useState(false)

  // Compute total owe / owed across all groups (per currency)
  const totals: Record<string, { owe: number; owed: number }> = {}
  if (balanceMap) {
    for (const b of Object.values(balanceMap)) {
      if (!totals[b.currency]) totals[b.currency] = { owe: 0, owed: 0 }
      if (b.net < 0) totals[b.currency].owe += -b.net
      else if (b.net > 0) totals[b.currency].owed += b.net
    }
  }

  // Pick the dominant currency (highest total activity)
  const dominantCurrency = Object.entries(totals).sort(
    (a, b) => (b[1].owe + b[1].owed) - (a[1].owe + a[1].owed)
  )[0]

  const totalOwe = dominantCurrency ? dominantCurrency[1].owe : 0
  const totalOwed = dominantCurrency ? dominantCurrency[1].owed : 0
  const summCurrency = dominantCurrency?.[0] ?? 'USD'

  return (
    <Layout
      title="My Groups"
      headerRight={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            title="Import group from CSV"
          >
            <Upload size={18} />
          </button>
          <Link
            to="/create-group"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
          </Link>
        </div>
      }
    >
      {/* ── Balance summary banner ──────────────────────────── */}
      {groups && groups.length > 0 && (
        <div className="mb-5">
          {/* Greeting */}
          <p className="text-sm text-gray-500 mb-3">
            Welcome back,{' '}
            <span className="font-semibold text-gray-800">{profile?.display_name ?? '…'}</span>
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* You owe */}
            <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center">
                  <TrendingDown size={14} className="text-red-500" />
                </div>
                <span className="text-xs font-medium text-red-600">You owe</span>
              </div>
              <p className="text-xl font-bold text-red-600">
                {totalOwe > 0 ? formatMoney(totalOwe, summCurrency) : '—'}
              </p>
            </div>

            {/* You're owed */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
                  <TrendingUp size={14} className="text-green-600" />
                </div>
                <span className="text-xs font-medium text-green-700">You're owed</span>
              </div>
              <p className="text-xl font-bold text-green-700">
                {totalOwed > 0 ? formatMoney(totalOwed, summCurrency) : '—'}
              </p>
            </div>
          </div>

          {/* Net balance */}
          {(totalOwe > 0 || totalOwed > 0) && (() => {
            const net = totalOwed - totalOwe
            const settled = net === 0 && totalOwe === 0
            return !settled ? (
              <div className="mt-3 flex items-center gap-2 px-4 py-2 bg-white border border-gray-100 rounded-xl">
                <Minus size={14} className="text-gray-400" />
                <span className="text-xs text-gray-500">
                  Net:{' '}
                  <span className={`font-semibold ${net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {net >= 0 ? '+' : ''}{formatMoney(Math.abs(net), summCurrency)}
                  </span>
                </span>
              </div>
            ) : null
          })()}
        </div>
      )}

      {/* ── Group list ──────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
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
        <div className="space-y-3">
          {groups.map(g => {
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
      )}

      {/* FAB – mobile only when list has items */}
      {groups && groups.length > 0 && (
        <Link
          to="/create-group"
          className="md:hidden fixed bottom-20 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 transition-colors z-30"
        >
          <Plus size={24} />
        </Link>
      )}

      {/* Import modal */}
      {showImport && <ImportGroupModal onClose={() => setShowImport(false)} />}
    </Layout>
  )
}
