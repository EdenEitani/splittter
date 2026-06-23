/**
 * Standalone Supabase expense operations.
 * Used by both useExpenses hooks (online path) and syncEngine (replay path).
 */
import { supabase } from './supabase'
import { toMinorUnits, convertAmount } from './money'
import { computeParticipantShares } from './balance'
import { ensureDailyRates, getFxRate, todayISO } from './fx'
import type { Expense, ExpenseFormData, Profile } from '@/types'
import { offlineDb } from '@/offline/db'

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createExpenseInSupabase(
  groupId: string,
  groupCurrency: string,
  form: ExpenseFormData,
  userId: string,
): Promise<Expense> {
  const fxDate = todayISO()
  const originalMinor = toMinorUnits(form.original_amount, form.original_currency)

  if (form.original_currency !== groupCurrency) {
    await ensureDailyRates(groupCurrency, form.original_currency)
  }
  const fxRate = await getFxRate(form.original_currency, groupCurrency, fxDate)
  const groupMinor = convertAmount(originalMinor, fxRate)

  const participantShares = computeParticipantShares(
    form.participant_ids,
    groupMinor,
    form.split_method,
    form.split_method === 'custom_amounts'
      ? Object.fromEntries(
          Object.entries(form.custom_amounts).map(([k, v]) => [k, toMinorUnits(v, groupCurrency)])
        )
      : undefined,
    form.split_method === 'percent'
      ? Object.fromEntries(
          Object.entries(form.custom_percents).map(([k, v]) => [k, parseFloat(v)])
        )
      : undefined,
  )

  const { data: expense, error } = await supabase
    .from('expenses')
    .insert({
      group_id: groupId,
      created_by: userId,
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

  const payerIds = form.payer_ids
  const hasCustomPayerAmounts =
    payerIds.length > 1 && Object.keys(form.payer_amounts ?? {}).length > 0

  const participantRows = [
    ...payerIds.map((uid, i) => {
      let share: number
      if (hasCustomPayerAmounts) {
        const payerOriginalMinor = toMinorUnits(form.payer_amounts[uid] || '0', form.original_currency)
        share = convertAmount(payerOriginalMinor, fxRate)
        // Last payer absorbs any rounding remainder
        if (i === payerIds.length - 1) {
          const prevSum = payerIds.slice(0, -1).reduce((s, id) => {
            const m = toMinorUnits(form.payer_amounts[id] || '0', form.original_currency)
            return s + convertAmount(m, fxRate)
          }, 0)
          share = Math.max(0, groupMinor - prevSum)
        }
      } else {
        const equalShare = Math.round(groupMinor / payerIds.length)
        share = i < payerIds.length - 1
          ? equalShare
          : groupMinor - equalShare * (payerIds.length - 1)
      }
      return {
        expense_id: expense.id,
        user_id: uid,
        role: 'payer' as const,
        weight: 1,
        share_amount_group_currency: share,
      }
    }),
    ...form.participant_ids.map(uid => ({
      expense_id: expense.id,
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

  return expense as Expense
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteExpenseInSupabase(expenseId: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', expenseId)
  if (error) throw error
}

// ─── Build optimistic expense (for offline creation) ─────────────────────────

export async function buildOptimisticExpense(
  localId: string,
  groupId: string,
  groupCurrency: string,
  form: ExpenseFormData,
  userId: string,
): Promise<Expense & { _status: 'pending'; _localId: string }> {
  // Look up member profiles from IndexedDB cache
  const memberRows = await offlineDb.groupMembers.where('group_id').equals(groupId).toArray()
  const profileMap: Record<string, Profile> = {}
  memberRows.forEach(m => { if (m.profile) profileMap[m.user_id] = m.profile })

  const originalMinor = toMinorUnits(form.original_amount, form.original_currency)
  // Use 1:1 approximation for cross-currency until synced (will be corrected on sync)
  const groupMinor = originalMinor

  const participantShares = computeParticipantShares(
    form.participant_ids,
    groupMinor,
    form.split_method,
    form.split_method === 'custom_amounts'
      ? Object.fromEntries(
          Object.entries(form.custom_amounts).map(([k, v]) => [k, toMinorUnits(v, groupCurrency)])
        )
      : undefined,
    form.split_method === 'percent'
      ? Object.fromEntries(
          Object.entries(form.custom_percents).map(([k, v]) => [k, parseFloat(v)])
        )
      : undefined,
  )

  const hasCustomPayerAmounts =
    form.payer_ids.length > 1 && Object.keys(form.payer_amounts ?? {}).length > 0

  return {
    id: localId,
    _localId: localId,
    _status: 'pending',
    group_id: groupId,
    created_by: userId,
    label: form.label.trim(),
    notes: form.notes.trim() || null,
    original_amount: originalMinor,
    original_currency: form.original_currency,
    group_amount: groupMinor,
    group_currency: groupCurrency,
    fx_rate: 1,
    fx_date: form.occurred_at.slice(0, 10),
    category_id: form.category_id,
    category_confidence: form.category_confidence,
    occurred_at: form.occurred_at,
    created_at: new Date().toISOString(),
    participants: [
      ...form.payer_ids.map((uid, i) => {
        let share: number
        if (hasCustomPayerAmounts) {
          share = toMinorUnits(form.payer_amounts[uid] || '0', form.original_currency)
          if (i === form.payer_ids.length - 1) {
            const prevSum = form.payer_ids.slice(0, -1)
              .reduce((s, id) => s + toMinorUnits(form.payer_amounts[id] || '0', form.original_currency), 0)
            share = Math.max(0, groupMinor - prevSum)
          }
        } else {
          const equalShare = Math.round(groupMinor / form.payer_ids.length)
          share = i < form.payer_ids.length - 1
            ? equalShare
            : groupMinor - equalShare * (form.payer_ids.length - 1)
        }
        return {
          expense_id: localId,
          user_id: uid,
          role: 'payer' as const,
          weight: 1,
          share_amount_group_currency: share,
          profile: profileMap[uid],
        }
      }),
      ...form.participant_ids.map(uid => ({
        expense_id: localId,
        user_id: uid,
        role: 'participant' as const,
        weight: 1,
        share_amount_group_currency: participantShares[uid] ?? 0,
        profile: profileMap[uid],
      })),
    ],
  }
}
