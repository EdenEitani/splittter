/**
 * Standalone Supabase payment operations.
 * Used by both usePayments hooks (online path) and syncEngine (replay path).
 */
import { supabase } from './supabase'
import { toMinorUnits, convertAmount } from './money'
import { getFxRate, todayISO } from './fx'
import type { Payment, PaymentFormData, Profile } from '@/types'
import { offlineDb } from '@/offline/db'

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createPaymentInSupabase(
  groupId: string,
  groupCurrency: string,
  form: PaymentFormData,
  userId: string,
): Promise<Payment> {
  const fxDate = todayISO()
  const originalMinor = toMinorUnits(form.original_amount, form.original_currency)
  const fxRate = await getFxRate(form.original_currency, groupCurrency, fxDate)
  const groupMinor = convertAmount(originalMinor, fxRate)

  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      group_id: groupId,
      created_by: userId,
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
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deletePaymentInSupabase(paymentId: string): Promise<void> {
  const { error } = await supabase.from('payments').delete().eq('id', paymentId)
  if (error) throw error
}

// ─── Build optimistic payment (for offline creation) ──────────────────────────

export async function buildOptimisticPayment(
  localId: string,
  groupId: string,
  groupCurrency: string,
  form: PaymentFormData,
  userId: string,
): Promise<Payment & { _status: 'pending'; _localId: string }> {
  const memberRows = await offlineDb.groupMembers.where('group_id').equals(groupId).toArray()
  const profileMap: Record<string, Profile> = {}
  memberRows.forEach(m => { if (m.profile) profileMap[m.user_id] = m.profile })

  const originalMinor = toMinorUnits(form.original_amount, form.original_currency)

  return {
    id: localId,
    _localId: localId,
    _status: 'pending',
    group_id: groupId,
    created_by: userId,
    from_user_id: form.from_user_id,
    to_user_id: form.to_user_id,
    original_amount: originalMinor,
    original_currency: form.original_currency,
    group_amount: originalMinor, // approximate until synced
    group_currency: groupCurrency,
    fx_rate: 1,
    fx_date: form.occurred_at.slice(0, 10),
    occurred_at: form.occurred_at,
    created_at: new Date().toISOString(),
    notes: form.notes.trim() || null,
    from_profile: profileMap[form.from_user_id],
    to_profile: profileMap[form.to_user_id],
  }
}
