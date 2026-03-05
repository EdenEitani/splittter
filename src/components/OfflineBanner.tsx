import { useNetworkStatus } from '@/offline/networkStatus'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { clsx } from 'clsx'
import { WifiOff, RefreshCw, Check, AlertTriangle } from 'lucide-react'

export function OfflineBanner() {
  const { isOffline } = useNetworkStatus()
  const { syncState, pendingCount } = useOfflineSync()

  // Nothing to show: online and nothing in flight
  if (!isOffline && syncState === 'idle' && pendingCount === 0) return null

  const isSyncing = syncState === 'syncing'
  const isSynced = syncState === 'synced'
  const isError = syncState === 'error'

  return (
    <div
      className={clsx(
        'fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium transition-colors duration-300',
        isOffline && 'bg-gray-800 text-white',
        isSyncing && 'bg-blue-600 text-white',
        isSynced && 'bg-green-600 text-white',
        isError && 'bg-amber-500 text-white',
        !isOffline && !isSyncing && !isSynced && !isError && pendingCount > 0 && 'bg-amber-500 text-white',
      )}
      style={{ paddingTop: `calc(env(safe-area-inset-top) + 8px)` }}
    >
      {isOffline && (
        <>
          <WifiOff size={13} />
          <span>Offline mode — changes will sync when you reconnect</span>
          {pendingCount > 0 && (
            <span className="ml-1 bg-white/20 rounded-full px-1.5 py-0.5">
              {pendingCount} pending
            </span>
          )}
        </>
      )}
      {!isOffline && isSyncing && (
        <>
          <RefreshCw size={13} className="animate-spin" />
          <span>Reconnected — syncing changes…</span>
        </>
      )}
      {!isOffline && isSynced && (
        <>
          <Check size={13} />
          <span>All changes synced</span>
        </>
      )}
      {!isOffline && isError && (
        <>
          <AlertTriangle size={13} />
          <span>Some changes failed to sync — will retry on next reconnect</span>
        </>
      )}
      {!isOffline && !isSyncing && !isSynced && !isError && pendingCount > 0 && (
        <>
          <AlertTriangle size={13} />
          <span>{pendingCount} change{pendingCount !== 1 ? 's' : ''} pending sync</span>
        </>
      )}
    </div>
  )
}
