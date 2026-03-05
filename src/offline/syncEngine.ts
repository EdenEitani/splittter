import { offlineDb } from './db'
import { getPendingActions, removeAction, failAction } from './offlineQueue'
import { createExpenseInSupabase, deleteExpenseInSupabase } from '@/lib/expenseOps'
import { createPaymentInSupabase, deletePaymentInSupabase } from '@/lib/paymentOps'
import { supabase } from '@/lib/supabase'
import type { QueryClient } from '@tanstack/react-query'
import type { ExpenseFormData, PaymentFormData } from '@/types'

export interface SyncResult {
  synced: number
  failed: number
}

let isSyncing = false

export async function runSync(queryClient: QueryClient): Promise<SyncResult> {
  if (isSyncing) return { synced: 0, failed: 0 }
  isSyncing = true

  let synced = 0
  let failed = 0

  try {
    // Auth check — use session (no network call) so this works right after reconnect
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { synced: 0, failed: 0 }
    const userId = session.user.id

    const actions = await getPendingActions()

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'create_expense': {
            const { form, groupCurrency, localId } = action.payload as {
              form: ExpenseFormData
              groupCurrency: string
              localId: string
            }
            await createExpenseInSupabase(action.groupId, groupCurrency, form, userId)
            // Remove the local optimistic expense now the real one exists
            if (localId) await offlineDb.expenses.delete(localId)
            break
          }

          case 'delete_expense': {
            const { expenseId } = action.payload as { expenseId: string }
            // Skip if it was a local-only expense (never reached server)
            if (!expenseId.startsWith('local_')) {
              await deleteExpenseInSupabase(expenseId)
            }
            break
          }

          case 'create_payment': {
            const { form, groupCurrency, localId } = action.payload as {
              form: PaymentFormData
              groupCurrency: string
              localId: string
            }
            await createPaymentInSupabase(action.groupId, groupCurrency, form, userId)
            if (localId) await offlineDb.payments.delete(localId)
            break
          }

          case 'delete_payment': {
            const { paymentId } = action.payload as { paymentId: string }
            if (!paymentId.startsWith('local_')) {
              await deletePaymentInSupabase(paymentId)
            }
            break
          }
        }

        await removeAction(action.id)
        synced++

        // Invalidate affected queries so UI refreshes
        queryClient.invalidateQueries({ queryKey: ['expenses', action.groupId] })
        queryClient.invalidateQueries({ queryKey: ['payments', action.groupId] })
        queryClient.invalidateQueries({ queryKey: ['groups'] })
        queryClient.invalidateQueries({ queryKey: ['user_groups_balance'] })
      } catch (err) {
        console.warn('[sync] Action failed:', action.type, err)
        await failAction(action.id, String(err))
        failed++
      }
    }

    await offlineDb.meta.put({ key: 'lastSyncTime', value: new Date().toISOString() })
  } finally {
    isSyncing = false
  }

  return { synced, failed }
}
