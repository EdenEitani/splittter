import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Payment, PaymentFormData } from '@/types'
import { offlineDb, isOffline, enqueue } from '@/offline'
import { createPaymentInSupabase, deletePaymentInSupabase, buildOptimisticPayment } from '@/lib/paymentOps'

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const paymentKeys = {
  list: (groupId: string) => ['payments', groupId] as const,
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function usePayments(groupId: string) {
  return useQuery({
    queryKey: paymentKeys.list(groupId),
    networkMode: 'always',
    queryFn: async () => {
      if (isOffline()) {
        const cached = await offlineDb.payments
          .where('group_id').equals(groupId)
          .toArray()
        return cached.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)) as Payment[]
      }

      try {
        const { data, error } = await supabase
          .from('payments')
          .select(`
            *,
            from_profile:profiles!payments_from_user_id_fkey(*),
            to_profile:profiles!payments_to_user_id_fkey(*)
          `)
          .eq('group_id', groupId)
          .order('occurred_at', { ascending: false })

        if (error) throw error
        const payments = data as Payment[]

        // Cache to IndexedDB
        await offlineDb.payments.bulkPut(payments)

        // Merge with pending local payments
        const pending = await offlineDb.payments
          .where('group_id').equals(groupId)
          .filter(p => (p as Payment & { _status?: string })._status === 'pending')
          .toArray()

        return [...pending, ...payments].sort((a, b) =>
          b.occurred_at.localeCompare(a.occurred_at)
        ) as Payment[]
      } catch {
        const cached = await offlineDb.payments
          .where('group_id').equals(groupId)
          .toArray()
        return cached.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)) as Payment[]
      }
    },
    enabled: !!groupId,
    staleTime: 1000 * 30,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreatePayment(groupId: string, groupCurrency: string) {
  const qc = useQueryClient()

  return useMutation({
    networkMode: 'always',
    mutationFn: async (form: PaymentFormData) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const userId = session.user.id

      if (isOffline()) {
        const localId = `local_${crypto.randomUUID()}`
        const optimistic = await buildOptimisticPayment(localId, groupId, groupCurrency, form, userId)
        await offlineDb.payments.put(optimistic as unknown as Payment)
        await enqueue('create_payment', groupId, { form, groupCurrency, localId }, localId)
        return optimistic as unknown as Payment
      }

      return createPaymentInSupabase(groupId, groupCurrency, form, userId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: paymentKeys.list(groupId) })
    },
  })
}

export function useDeletePayment(groupId: string) {
  const qc = useQueryClient()

  return useMutation({
    networkMode: 'always',
    mutationFn: async (paymentId: string) => {
      // Optimistic local delete
      await offlineDb.payments.delete(paymentId)

      if (isOffline()) {
        if (paymentId.startsWith('local_')) {
          const queue = await offlineDb.offlineQueue.toArray()
          const creates = queue.filter(a => a.localId === paymentId)
          await offlineDb.offlineQueue.bulkDelete(creates.map(a => a.id))
        } else {
          await enqueue('delete_payment', groupId, { paymentId })
        }
        return
      }

      if (paymentId.startsWith('local_')) {
        const queue = await offlineDb.offlineQueue.toArray()
        const creates = queue.filter(a => a.localId === paymentId)
        await offlineDb.offlineQueue.bulkDelete(creates.map(a => a.id))
        return
      }

      await deletePaymentInSupabase(paymentId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: paymentKeys.list(groupId) })
    },
  })
}
