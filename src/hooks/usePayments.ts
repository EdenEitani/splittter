import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toMinorUnits, convertAmount } from '@/lib/money'
import { getFxRate, todayISO } from '@/lib/fx'
import type { Payment, PaymentFormData } from '@/types'

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const paymentKeys = {
  list: (groupId: string) => ['payments', groupId] as const,
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function usePayments(groupId: string) {
  return useQuery({
    queryKey: paymentKeys.list(groupId),
    queryFn: async () => {
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
      return data as Payment[]
    },
    enabled: !!groupId,
    staleTime: 1000 * 30,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreatePayment(groupId: string, groupCurrency: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (form: PaymentFormData) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const fxDate = todayISO()
      const originalMinor = toMinorUnits(form.original_amount, form.original_currency)
      const fxRate = await getFxRate(form.original_currency, groupCurrency, fxDate)
      const groupMinor = convertAmount(originalMinor, fxRate)

      const { data: payment, error } = await supabase
        .from('payments')
        .insert({
          group_id: groupId,
          created_by: user.id,
          from_user_id: form.from_user_id,
          to_user_id: form.to_user_id,
          original_amount: originalMinor,
          original_currency: form.original_currency,
          group_amount: groupMinor,
          group_currency: groupCurrency,
          fx_rate: fxRate,
          fx_date: fxDate,
          occurred_at: form.occurred_at,
          notes: form.notes.trim() || null,
        })
        .select()
        .single()

      if (error) throw error
      return payment as Payment
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: paymentKeys.list(groupId) })
    },
  })
}

export function useDeletePayment(groupId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', paymentId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: paymentKeys.list(groupId) })
    },
  })
}
