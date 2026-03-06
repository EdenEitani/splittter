import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toMinorUnits, convertAmount } from '@/lib/money'
import { computeParticipantShares } from '@/lib/balance'
import { ensureDailyRates, getFxRate, todayISO } from '@/lib/fx'
import type { Expense, ExpenseFormData } from '@/types'
import {
  offlineDb,
  isOffline,
  enqueue,
} from '@/offline'
import {
  createExpenseInSupabase,
  deleteExpenseInSupabase,
  buildOptimisticExpense,
} from '@/lib/expenseOps'

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const expenseKeys = {
  list: (groupId: string) => ['expenses', groupId] as const,
  detail: (id: string) => ['expenses', 'detail', id] as const,
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useExpenses(groupId: string) {
  return useQuery({
    queryKey: expenseKeys.list(groupId),
    networkMode: 'always',
    queryFn: async () => {
      if (isOffline()) {
        // Serve entirely from IndexedDB
        const cached = await offlineDb.expenses
          .where('group_id').equals(groupId)
          .toArray()
        return cached.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)) as Expense[]
      }

      try {
        const { data, error } = await supabase
          .from('expenses')
          .select(`
            *,
            category:categories(*),
            participants:expense_participants(
              *,
              profile:profiles(*)
            )
          `)
          .eq('group_id', groupId)
          .order('occurred_at', { ascending: false })

        if (error) throw error
        const expenses = data as Expense[]

        // Cache synced expenses to IndexedDB
        await offlineDb.expenses.bulkPut(
          expenses.map(e => ({ ...e, _status: 'synced' as const }))
        )

        // Merge with any pending local expenses (created while offline)
        const pending = await offlineDb.expenses
          .where('group_id').equals(groupId)
          .filter(e => e._status === 'pending')
          .toArray()

        const allExpenses = [...pending, ...expenses]
        return allExpenses.sort((a, b) =>
          b.occurred_at.localeCompare(a.occurred_at)
        ) as Expense[]
      } catch {
        // Network error — fall back to IndexedDB
        const cached = await offlineDb.expenses
          .where('group_id').equals(groupId)
          .toArray()
        return cached.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)) as Expense[]
      }
    },
    enabled: !!groupId,
    staleTime: 1000 * 30,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateExpense(groupId: string, groupCurrency: string) {
  const qc = useQueryClient()

  return useMutation({
    networkMode: 'always',
    mutationFn: async (form: ExpenseFormData) => {
      // Use getSession (no network call) so this works offline
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const userId = session.user.id

      if (isOffline()) {
        const localId = `local_${crypto.randomUUID()}`
        const optimistic = await buildOptimisticExpense(localId, groupId, groupCurrency, form, userId)
        // Persist optimistic expense in IndexedDB
        await offlineDb.expenses.put(optimistic)
        // Queue for sync when back online
        await enqueue('create_expense', groupId, { form, groupCurrency, localId }, localId)
        return optimistic as unknown as Expense
      }

      return createExpenseInSupabase(groupId, groupCurrency, form, userId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.list(groupId) })
    },
  })
}

export function useUpdateExpense(groupId: string, groupCurrency: string) {
  const qc = useQueryClient()

  return useMutation({
    networkMode: 'always',
    mutationFn: async ({ expenseId, form }: { expenseId: string; form: ExpenseFormData }) => {
      if (isOffline()) {
        throw new Error('Cannot edit expenses while offline. Please reconnect and try again.')
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const fxDate = todayISO()
      const originalMinor = toMinorUnits(form.original_amount, form.original_currency)
      if (form.original_currency !== groupCurrency) {
        await ensureDailyRates(groupCurrency)
      }
      const fxRate = await getFxRate(form.original_currency, groupCurrency, fxDate)
      const groupMinor = convertAmount(originalMinor, fxRate)

      const participantShares = computeParticipantShares(
        form.participant_ids,
        groupMinor,
        form.split_method,
        form.split_method === 'custom_amounts'
          ? Object.fromEntries(
              Object.entries(form.custom_amounts).map(([k, v]) =>
                [k, toMinorUnits(v, groupCurrency)]
              )
            )
          : undefined,
        form.split_method === 'percent'
          ? Object.fromEntries(
              Object.entries(form.custom_percents).map(([k, v]) => [k, parseFloat(v)])
            )
          : undefined,
      )

      const { error } = await supabase
        .from('expenses')
        .update({
          label: form.label.trim(),
          notes: form.notes.trim() || null,
          original_amount: originalMinor,
          original_currency: form.original_currency,
          group_amount: groupMinor,
          group_currency: groupCurrency,
          fx_rate: fxRate,
          fx_date: fxDate,
          category_id: form.category_id,
          category_confidence: form.category_confidence,
          occurred_at: form.occurred_at,
        })
        .eq('id', expenseId)

      if (error) throw error

      const { error: delError } = await supabase
        .from('expense_participants')
        .delete()
        .eq('expense_id', expenseId)
      if (delError) throw delError

      const payerIds = form.payer_ids
      const payerShare = payerIds.length > 0 ? Math.round(groupMinor / payerIds.length) : 0

      const participantRows = [
        ...payerIds.map((uid, i) => ({
          expense_id: expenseId,
          user_id: uid,
          role: 'payer' as const,
          weight: 1,
          share_amount_group_currency:
            i < payerIds.length - 1
              ? payerShare
              : groupMinor - payerShare * (payerIds.length - 1),
        })),
        ...form.participant_ids.map(uid => ({
          expense_id: expenseId,
          user_id: uid,
          role: 'participant' as const,
          weight: 1,
          share_amount_group_currency: participantShares[uid] ?? 0,
        })),
      ]

      const { error: partError } = await supabase
        .from('expense_participants')
        .insert(participantRows)
      if (partError) throw partError

      // Update IndexedDB cache — invalidation will refresh it
      await offlineDb.expenses.delete(expenseId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.list(groupId) })
    },
  })
}

export function useDeleteExpense(groupId: string) {
  const qc = useQueryClient()

  return useMutation({
    networkMode: 'always',
    mutationFn: async (expenseId: string) => {
      // Always remove from local IndexedDB immediately (optimistic)
      await offlineDb.expenses.delete(expenseId)

      if (isOffline()) {
        if (expenseId.startsWith('local_')) {
          // Cancel the pending create — remove from queue
          const queue = await offlineDb.offlineQueue.toArray()
          const creates = queue.filter(a => a.localId === expenseId)
          await offlineDb.offlineQueue.bulkDelete(creates.map(a => a.id))
        } else {
          // Queue server-side delete for when we reconnect
          await enqueue('delete_expense', groupId, { expenseId })
        }
        return
      }

      // Online: if it was a pending local expense, also clean up any stale queue entries
      if (expenseId.startsWith('local_')) {
        const queue = await offlineDb.offlineQueue.toArray()
        const creates = queue.filter(a => a.localId === expenseId)
        await offlineDb.offlineQueue.bulkDelete(creates.map(a => a.id))
        return
      }

      await deleteExpenseInSupabase(expenseId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.list(groupId) })
    },
  })
}
