import Dexie, { type Table } from 'dexie'
import type { Group, GroupMember, Expense, Payment, Profile } from '@/types'

// ─── Action Types ─────────────────────────────────────────────────────────────

export type OfflineActionType =
  | 'create_expense'
  | 'delete_expense'
  | 'create_payment'
  | 'delete_payment'

export interface OfflineAction {
  id: string
  type: OfflineActionType
  groupId: string
  payload: unknown
  localId?: string      // temp ID for created items (starts with "local_")
  createdAt: string
  status: 'pending' | 'failed'
  retryCount: number
  error?: string
}

// ─── Extended types ───────────────────────────────────────────────────────────

export interface CachedGroupMember extends GroupMember {
  profile?: Profile
}

/** Expense extended with local cache metadata */
export type CachedExpense = Expense & {
  _status?: 'synced' | 'pending'
  _localId?: string
}

// ─── Database ─────────────────────────────────────────────────────────────────

export class SplittterDB extends Dexie {
  groups!: Table<Group, string>
  groupMembers!: Table<CachedGroupMember, [string, string]>
  expenses!: Table<CachedExpense, string>
  payments!: Table<Payment, string>
  offlineQueue!: Table<OfflineAction, string>
  meta!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('splittter-offline-v1')
    this.version(1).stores({
      groups: 'id, created_at',
      groupMembers: '[group_id+user_id], group_id',
      expenses: 'id, group_id, occurred_at, _status',
      payments: 'id, group_id, occurred_at',
      offlineQueue: 'id, status, groupId, createdAt',
      meta: 'key',
    })
  }
}

export const offlineDb = new SplittterDB()
