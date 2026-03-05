import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { onOnline } from '@/offline/networkStatus'
import { runSync } from '@/offline/syncEngine'
import { getPendingActions } from '@/offline/offlineQueue'

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error'

export function useOfflineSync() {
  const queryClient = useQueryClient()
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [pendingCount, setPendingCount] = useState(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Poll pending count so UI stays up to date
  useEffect(() => {
    let alive = true
    const poll = async () => {
      const actions = await getPendingActions()
      if (alive) setPendingCount(actions.length)
    }
    poll()
    const id = setInterval(poll, 3000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // Sync whenever connection is restored
  useEffect(() => {
    const unsub = onOnline(async () => {
      const actions = await getPendingActions()
      if (actions.length === 0) return

      setSyncState('syncing')

      try {
        const result = await runSync(queryClient)
        const remaining = await getPendingActions()
        setPendingCount(remaining.length)

        if (result.failed > 0) {
          setSyncState('error')
        } else {
          setSyncState('synced')
          timeoutRef.current = setTimeout(() => setSyncState('idle'), 3000)
        }
      } catch {
        setSyncState('error')
      }
    })

    return () => {
      unsub()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [queryClient])

  const manualSync = async () => {
    setSyncState('syncing')
    try {
      const result = await runSync(queryClient)
      const remaining = await getPendingActions()
      setPendingCount(remaining.length)
      setSyncState(result.failed > 0 ? 'error' : 'synced')
      timeoutRef.current = setTimeout(() => setSyncState('idle'), 3000)
    } catch {
      setSyncState('error')
    }
  }

  return { syncState, pendingCount, manualSync }
}
