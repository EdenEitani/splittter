import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toMinorUnits, convertAmount } from '@/lib/money'
import { computeParticipantShares } from '@/lib/balance'
import { getFxRate, todayISO } from '@/lib/fx'
import type { Expense, ExpenseFormData } from '@/types'

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const expenseKeys = {
  list: (groupId: string) => ['expenses', groupId] as const,
  detail: (id: string) => ['expenses', 'detail', id] as const,
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useExpenses(groupId: string) {
  return useQuery({
    queryKey: expenseKeys.list(groupId),
    queryFn: async () => {
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
      return data as Expense[]
    },
    enabled: !!groupId,
    staleTime: 1000 * 30,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateExpense(groupId: string, groupCurrency: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (form: ExpenseFormData) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const fxDate = todayISO()
      const originalMinor = toMinorUnits(form.original_amount, form.original_currency)

      // Fetch FX rate
      const fxRate = await getFxRate(form.original_currency, groupCurrency, fxDate)
      const groupMinor = convertAmount(originalMinor, fxRate)

      // Compute participant shares in group currency
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
          : undefined
      )

      // Create expense
      const { data: expense, error } = await supabase
        .from('expenses')
        .insert({
          group_id: groupId,
          created_by: user.id,
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
        .select()
        .single()

      if (error) throw error

      // Build participant rows
      const payerIds = form.payer_ids
      const payerShare = payerIds.length > 0
        ? Math.round(groupMinor / payerIds.length)
        : 0

      const participantRows = [
        // Payer rows
        ...payerIds.map((userId, i) => ({
          expense_id: expense.id,
          user_id: userId,
          role: 'payer' as const,
          weight: 1,
          share_amount_group_currency:
            i < payerIds.length - 1
              ? payerShare
              : groupMinor - payerShare * (payerIds.length - 1),
        })),
        // Participant rows
        ...form.participant_ids.map(userId => ({
          expense_id: expense.id,
          user_id: userId,
          role: 'participant' as const,
          weight: 1,
          share_amount_group_currency: participantShares[userId] ?? 0,
        })),
      ]

      const { error: partError } = await supabase
        .from('expense_participants')
        .insert(participantRows)

      if (partError) throw partError

      return expense as Expense
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.list(groupId) })
    },
  })
}

export function useUpdateExpense(groupId: string, groupCurrency: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ expenseId, form }: { expenseId: string; form: ExpenseFormData }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const fxDate = todayISO()
      const originalMinor = toMinorUnits(form.original_amount, form.original_currency)
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
          : undefined
      )

      // Update expense row
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

      // Replace participants: delete old, insert new
      const { error: delError } = await supabase
        .from('expense_participants')
        .delete()
        .eq('expense_id', expenseId)

      if (delError) throw delError

      const payerIds = form.payer_ids
      const payerShare = payerIds.length > 0 ? Math.round(groupMinor / payerIds.length) : 0

      const participantRows = [
        ...payerIds.map((userId, i) => ({
          expense_id: expenseId,
          user_id: userId,
          role: 'payer' as const,
          weight: 1,
          share_amount_group_currency:
            i < payerIds.length - 1
              ? payerShare
              : groupMinor - payerShare * (payerIds.length - 1),
        })),
        ...form.participant_ids.map(userId => ({
          expense_id: expenseId,
          user_id: userId,
          role: 'participant' as const,
          weight: 1,
          share_amount_group_currency: participantShares[userId] ?? 0,
        })),
      ]

      const { error: partError } = await supabase
        .from('expense_participants')
        .insert(participantRows)

      if (partError) throw partError
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.list(groupId) })
    },
  })
}

export function useDeleteExpense(groupId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (expenseId: string) => {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.list(groupId) })
    },
  })
}
