import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toMinorUnits, fromMinorUnits } from '@/lib/money'
import { createExpenseInSupabase } from '@/lib/expenseOps'
import { todayISO } from '@/lib/fx'
import type { RecurringExpense, RecurrenceFrequency, ExpenseFormData } from '@/types'
import { expenseKeys } from './useExpenses'

export const recurringKeys = {
  list: (groupId: string) => ['recurring', groupId] as const,
}

export function advanceDate(dateStr: string, frequency: RecurrenceFrequency): string {
  // Parse as local date to avoid timezone shifting
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  switch (frequency) {
    case 'daily':   date.setDate(date.getDate() + 1); break
    case 'weekly':  date.setDate(date.getDate() + 7); break
    case 'monthly': date.setMonth(date.getMonth() + 1); break
    case 'yearly':  date.setFullYear(date.getFullYear() + 1); break
  }
  return date.toISOString().slice(0, 10)
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useRecurringExpenses(groupId: string) {
  return useQuery({
    queryKey: recurringKeys.list(groupId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select('*, category:categories(*)')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as RecurringExpense[]
    },
    enabled: !!groupId,
    staleTime: 1000 * 60,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateRecurringExpense(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      form,
      frequency,
      firstOccurrenceDate,
    }: {
      form: ExpenseFormData
      frequency: RecurrenceFrequency
      firstOccurrenceDate: string   // YYYY-MM-DD of the first expense (today)
    }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const nextDue = advanceDate(firstOccurrenceDate, frequency)

      const { error } = await supabase.from('recurring_expenses').insert({
        group_id: groupId,
        created_by: session.user.id,
        label: form.label.trim(),
        notes: form.notes.trim() || null,
        original_amount: toMinorUnits(form.original_amount, form.original_currency),
        original_currency: form.original_currency,
        category_id: form.category_id,
        payer_ids: form.payer_ids,
        participant_ids: form.participant_ids,
        split_method: form.split_method,
        custom_amounts: form.split_method === 'custom_amounts' ? form.custom_amounts : null,
        custom_percents: form.split_method === 'percent' ? form.custom_percents : null,
        frequency,
        next_due_date: nextDue,
        active: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recurringKeys.list(groupId) })
    },
  })
}

export function useDeleteRecurringExpense(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_expenses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recurringKeys.list(groupId) })
    },
  })
}

export function useToggleRecurringExpense(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('recurring_expenses')
        .update({ active })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recurringKeys.list(groupId) })
    },
  })
}

/**
 * Generates actual expense rows for any overdue recurring templates.
 * Should only be called for templates created by the current user
 * to avoid duplicate generation when multiple members are online.
 */
export function useGenerateDueExpenses(groupId: string, groupCurrency: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      dueExpenses,
      userId,
    }: {
      dueExpenses: RecurringExpense[]
      userId: string
    }) => {
      const today = todayISO()
      const MAX_PER_TEMPLATE = 24

      for (const re of dueExpenses) {
        // Only generate for this user's own templates (avoids duplicate generation)
        if (re.created_by !== userId) continue

        let currentDate = re.next_due_date
        let count = 0

        while (currentDate <= today && count < MAX_PER_TEMPLATE) {
          const form: ExpenseFormData = {
            label: re.label,
            notes: re.notes ?? '',
            original_amount: fromMinorUnits(re.original_amount, re.original_currency).toString(),
            original_currency: re.original_currency,
            category_id: re.category_id,
            category_confidence: null,
            occurred_at: currentDate + 'T12:00:00',
            payer_ids: re.payer_ids,
            participant_ids: re.participant_ids,
            split_method: re.split_method,
            custom_amounts: re.custom_amounts ?? {},
            custom_percents: re.custom_percents ?? {},
          }
          await createExpenseInSupabase(groupId, groupCurrency, form, userId)
          currentDate = advanceDate(currentDate, re.frequency)
          count++
        }

        // Advance next_due_date past today
        const { error } = await supabase
          .from('recurring_expenses')
          .update({ next_due_date: currentDate })
          .eq('id', re.id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.list(groupId) })
      qc.invalidateQueries({ queryKey: recurringKeys.list(groupId) })
    },
  })
}
