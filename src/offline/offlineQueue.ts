import { offlineDb, type OfflineAction, type OfflineActionType } from './db'

// ─── Enqueue ──────────────────────────────────────────────────────────────────

export async function enqueue(
  type: OfflineActionType,
  groupId: string,
  payload: unknown,
  localId?: string,
): Promise<string> {
  const id = crypto.randomUUID()
  await offlineDb.offlineQueue.add({
    id,
    type,
    groupId,
    payload,
    localId,
    createdAt: new Date().toISOString(),
    status: 'pending',
    retryCount: 0,
  })
  return id
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getPendingActions(): Promise<OfflineAction[]> {
  const all = await offlineDb.offlineQueue.toArray()
  return all
    .filter(a => a.status === 'pending' || a.status === 'failed')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function removeAction(id: string): Promise<void> {
  await offlineDb.offlineQueue.delete(id)
}

export async function failAction(id: string, error: string): Promise<void> {
  const action = await offlineDb.offlineQueue.get(id)
  if (!action) return
  await offlineDb.offlineQueue.put({
    ...action,
    status: 'failed',
    error,
    retryCount: action.retryCount + 1,
  })
}

export async function getQueueStats() {
  const all = await offlineDb.offlineQueue.toArray()
  const lastSyncMeta = await offlineDb.meta.get('lastSyncTime')
  return {
    total: all.length,
    pending: all.filter(a => a.status === 'pending').length,
    failed: all.filter(a => a.status === 'failed').length,
    actions: all,
    lastSyncTime: (lastSyncMeta?.value as string | undefined) ?? null,
  }
}

export async function clearFailedActions(): Promise<void> {
  const failed = await offlineDb.offlineQueue.where('status').equals('failed').toArray()
  await offlineDb.offlineQueue.bulkDelete(failed.map(a => a.id))
}
