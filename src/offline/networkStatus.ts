import { useState, useEffect } from 'react'

// ─── Module-level singleton ───────────────────────────────────────────────────
// Shared across all hooks and non-React code so they all see the same state.

type StatusListener = (online: boolean) => void
const listeners = new Set<StatusListener>()
let _isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    _isOnline = true
    listeners.forEach(l => l(true))
  })
  window.addEventListener('offline', () => {
    _isOnline = false
    listeners.forEach(l => l(false))
  })
}

/** Usable outside React components (e.g. in mutationFn) */
export function isOnline(): boolean { return _isOnline }
export function isOffline(): boolean { return !_isOnline }

/** Subscribe to "back online" events outside React. Returns unsubscribe fn. */
export function onOnline(cb: () => void): () => void {
  const handler = (v: boolean) => { if (v) cb() }
  listeners.add(handler)
  return () => listeners.delete(handler)
}

// ─── React Hook ───────────────────────────────────────────────────────────────

export function useNetworkStatus() {
  const [online, setOnline] = useState(_isOnline)

  useEffect(() => {
    const handler = (v: boolean) => setOnline(v)
    listeners.add(handler)
    return () => { listeners.delete(handler) }
  }, [])

  return {
    isOnline: online,
    isOffline: !online,
  }
}
