import { useState, useEffect } from 'react'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { refreshDailyRates } from '@/lib/fx'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { LogOut, RefreshCw, Clock, WifiOff, Trash2, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'
import { useNetworkStatus } from '@/offline/networkStatus'
import { getQueueStats, clearFailedActions } from '@/offline/offlineQueue'
import type { OfflineAction } from '@/offline/db'

function useLastFxSync() {
  return useQuery({
    queryKey: ['last_fx_sync'],
    queryFn: async () => {
      const { data } = await supabase
        .from('fx_rates')
        .select('date, created_at, base_currency')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
    staleTime: 1000 * 60,
  })
}

// ─── Offline Debug Panel ──────────────────────────────────────────────────────

function OfflineDebugPanel() {
  const { isOffline } = useNetworkStatus()
  const { syncState, pendingCount, manualSync } = useOfflineSync()
  const [stats, setStats] = useState<{
    total: number
    pending: number
    failed: number
    actions: OfflineAction[]
    lastSyncTime: string | null
  } | null>(null)

  const loadStats = async () => {
    const s = await getQueueStats()
    setStats(s)
  }

  useEffect(() => { loadStats() }, [pendingCount])

  const handleClearFailed = async () => {
    await clearFailedActions()
    await loadStats()
  }

  const actionTypeLabel: Record<string, string> = {
    create_expense: 'Create expense',
    delete_expense: 'Delete expense',
    create_payment: 'Create payment',
    delete_payment: 'Delete payment',
  }

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <WifiOff size={15} className="text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-700">Offline Debug</h2>
        <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          isOffline ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'
        }`}>
          {isOffline ? 'Offline' : 'Online'}
        </span>
      </div>

      {/* Status row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'Total queued', value: stats?.total ?? 0 },
          { label: 'Pending', value: stats?.pending ?? 0 },
          { label: 'Failed', value: stats?.failed ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-50 rounded-xl p-2 text-center">
            <p className="text-lg font-bold text-gray-900">{value}</p>
            <p className="text-[10px] text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Last sync */}
      {stats?.lastSyncTime && (
        <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">
          <Clock size={11} />
          Last sync: {format(new Date(stats.lastSyncTime), 'MMM d, HH:mm:ss')}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mb-3">
        <Button
          variant="secondary"
          onClick={manualSync}
          loading={syncState === 'syncing'}
          disabled={isOffline || (stats?.total ?? 0) === 0}
        >
          <RotateCcw size={13} className="mr-1.5" />
          Sync now
        </Button>
        {(stats?.failed ?? 0) > 0 && (
          <Button variant="danger" onClick={handleClearFailed}>
            <Trash2 size={13} className="mr-1.5" />
            Clear failed
          </Button>
        )}
        <Button variant="secondary" onClick={loadStats}>
          Refresh
        </Button>
      </div>

      {/* Queue list */}
      {stats && stats.actions.length > 0 ? (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {stats.actions.map(action => (
            <div
              key={action.id}
              className="flex items-center gap-2 text-xs bg-gray-50 rounded-xl px-3 py-2"
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                action.status === 'pending' ? 'bg-amber-400' : 'bg-red-400'
              }`} />
              <span className="font-medium text-gray-700 flex-1">
                {actionTypeLabel[action.type] ?? action.type}
              </span>
              <span className="text-gray-400 text-[10px]">
                {action.status}
                {action.retryCount > 0 && ` (${action.retryCount} retries)`}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 text-center py-2">Queue is empty</p>
      )}
    </div>
  )
}

// ─── Settings Page ────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { profile, signOut, updateProfile } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')
  const { data: lastSync, refetch: refetchSync } = useLastFxSync()

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!displayName.trim()) return
    setSaving(true)
    await updateProfile({ display_name: displayName.trim() })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleRefreshRates() {
    setRefreshing(true)
    setRefreshMsg('')
    try {
      await refreshDailyRates('USD')
      setRefreshMsg('FX rates refreshed successfully!')
      refetchSync()
    } catch (err) {
      setRefreshMsg(`Failed: ${(err as Error).message}`)
    }
    setRefreshing(false)
  }

  return (
    <Layout title="Settings">
      <div className="space-y-4">

        {/* Profile */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Profile</h2>
          <form onSubmit={handleSaveProfile} className="space-y-3">
            <Input
              label="Display name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
            <Button
              type="submit"
              variant="secondary"
              loading={saving}
              disabled={!displayName.trim()}
            >
              {saved ? '✓ Saved' : 'Save changes'}
            </Button>
          </form>
        </div>

        {/* FX Rates */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Exchange Rates</h2>
          <p className="text-xs text-gray-400 mb-3">
            Manually refresh today's FX rates if auto-refresh hasn't run yet.
          </p>

          {lastSync && (
            <div className="flex items-center gap-2 mb-3 text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
              <Clock size={12} className="text-gray-400 flex-shrink-0" />
              <span>
                Last synced:{' '}
                <span className="font-medium text-gray-700">
                  {format(new Date(lastSync.created_at), 'MMM d, yyyy · HH:mm')}
                </span>
                {' '}({lastSync.base_currency} base, {lastSync.date})
              </span>
            </div>
          )}

          <Button
            variant="secondary"
            onClick={handleRefreshRates}
            loading={refreshing}
          >
            <RefreshCw size={15} className="mr-1.5" />
            Refresh rates
          </Button>
          {refreshMsg && (
            <p className={`text-xs mt-2 ${refreshMsg.startsWith('Failed') ? 'text-red-500' : 'text-green-600'}`}>
              {refreshMsg}
            </p>
          )}
        </div>

        {/* Offline Debug */}
        <OfflineDebugPanel />

        {/* Account */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Account</h2>
          <p className="text-sm text-gray-500 mb-3">
            Signed in as <span className="font-medium">{profile?.display_name}</span>
          </p>
          <Button variant="danger" onClick={signOut}>
            <LogOut size={15} className="mr-1.5" />
            Sign out
          </Button>
        </div>

        {/* About */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">About</h2>
          <p className="text-xs text-gray-400">
            Splittter — Fast expense splitting<br />
            Built with Supabase + React + TailwindCSS
          </p>
        </div>
      </div>
    </Layout>
  )
}
