import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PersonBalance {
  /** Canonical identity key: email (lowercased) or 'name:<lowercased display_name>' */
  key: string
  display_name: string
  email: string | null
  avatar_url: string | null
  /** Per-currency net amounts. Positive = they owe me, negative = I owe them */
  nets: Record<string, number>
  /** The currency with the largest absolute net (used for primary display) */
  dominantCurrency: string
  dominantNet: number
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Computes pairwise balances between the current user and every other person
 * they share expenses with, across ALL groups.
 *
 * Identity deduplication:
 *   1. By email (case-insensitive) – same email = same person
 *   2. By display_name (case-insensitive) – fallback for guest members without email
 */
export function usePeopleBalances(userId: string | undefined) {
  return useQuery({
    queryKey: ['people_balances', userId],
    enabled: !!userId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      // ── 1. Find every expense I'm involved in ─────────────────
      const { data: myParts, error: myPartsErr } = await supabase
        .from('expense_participants')
        .select('expense_id')
        .eq('user_id', userId!)

      if (myPartsErr) throw myPartsErr

      const expenseIds = [...new Set((myParts ?? []).map(p => p.expense_id))]

      type PartRow = {
        expense_id: string
        user_id: string
        role: string
        share_amount_group_currency: number | null
        expense: { group_currency: string } | null
      }

      type PayRow = {
        from_user_id: string
        to_user_id: string
        group_amount: number
        group_currency: string
      }

      // ── 2. Batch-fetch all participants + all payments in parallel ─
      const [partsRes, paysRes] = await Promise.all([
        expenseIds.length > 0
          ? supabase
              .from('expense_participants')
              .select(
                'expense_id, user_id, role, share_amount_group_currency, expense:expenses!inner(group_currency)',
              )
              .in('expense_id', expenseIds)
          : Promise.resolve({ data: [] as PartRow[], error: null }),

        supabase
          .from('payments')
          .select('from_user_id, to_user_id, group_amount, group_currency')
          .or(`from_user_id.eq.${userId!},to_user_id.eq.${userId!}`),
      ])

      const allParts = (partsRes.data ?? []) as unknown as PartRow[]
      const allPays = (paysRes.data ?? []) as unknown as PayRow[]

      // ── 3. Compute net per other-user UUID ────────────────────
      // net[uuid][currency] > 0 → they owe me
      // net[uuid][currency] < 0 → I owe them
      const netByUuid: Record<string, Record<string, number>> = {}

      function addNet(uuid: string, currency: string, delta: number) {
        if (!netByUuid[uuid]) netByUuid[uuid] = {}
        netByUuid[uuid][currency] = (netByUuid[uuid][currency] ?? 0) + delta
      }

      // Group participant rows by expense
      const byExpense: Record<string, PartRow[]> = {}
      for (const p of allParts) {
        if (!byExpense[p.expense_id]) byExpense[p.expense_id] = []
        byExpense[p.expense_id].push(p)
      }

      for (const rows of Object.values(byExpense)) {
        const currency = rows[0]?.expense?.group_currency ?? 'USD'

        const myPayer = rows.find(r => r.user_id === userId && r.role === 'payer')
        const myParticipant = rows.find(r => r.user_id === userId && r.role === 'participant')

        if (myPayer) {
          // I fronted the money → each other participant owes me their share
          for (const r of rows) {
            if (r.user_id === userId || r.role !== 'participant') continue
            addNet(r.user_id, currency, r.share_amount_group_currency ?? 0)
          }
        }

        if (myParticipant) {
          // I owe the payer(s) my share
          const myShare = myParticipant.share_amount_group_currency ?? 0
          for (const r of rows) {
            if (r.user_id === userId || r.role !== 'payer') continue
            addNet(r.user_id, currency, -myShare)
          }
        }
      }

      // Payments
      for (const pay of allPays) {
        if (pay.from_user_id === userId) {
          // I paid someone → they owe me more (or I owe them less)
          addNet(pay.to_user_id, pay.group_currency, pay.group_amount)
        } else {
          // Someone paid me → they owe me less
          addNet(pay.from_user_id, pay.group_currency, -pay.group_amount)
        }
      }

      // Filter out myself and anyone fully settled
      const otherIds = Object.keys(netByUuid).filter(id => {
        if (id === userId) return false
        return Object.values(netByUuid[id]).some(n => Math.abs(n) > 0)
      })

      if (otherIds.length === 0) return []

      // ── 4. Fetch profiles for all other users ─────────────────
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, email, avatar_url')
        .in('id', otherIds)

      const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

      // ── 5. Merge by email → then by display_name ──────────────
      const merged: Record<string, PersonBalance> = {}

      for (const uuid of otherIds) {
        const profile = profileMap.get(uuid)
        if (!profile) continue

        const email = profile.email?.trim().toLowerCase()
        const key = email
          ? email
          : `name:${profile.display_name.trim().toLowerCase()}`

        if (!merged[key]) {
          merged[key] = {
            key,
            display_name: profile.display_name,
            email: profile.email ?? null,
            avatar_url: profile.avatar_url ?? null,
            nets: {},
            dominantCurrency: 'USD',
            dominantNet: 0,
          }
        }

        // Prefer the real-account display_name over a guest name
        if (!profile.email && merged[key].email) {
          // keep existing (email-based) name
        } else if (profile.email && !merged[key].email) {
          merged[key].display_name = profile.display_name
          merged[key].email = profile.email
        }

        for (const [currency, amount] of Object.entries(netByUuid[uuid])) {
          merged[key].nets[currency] = (merged[key].nets[currency] ?? 0) + amount
        }
      }

      // ── 6. Compute dominant currency + filter settled ─────────
      return Object.values(merged)
        .map(person => {
          const entries = Object.entries(person.nets)
            .filter(([, n]) => Math.abs(n) > 0)
            .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))

          if (entries.length === 0) return null

          return {
            ...person,
            dominantCurrency: entries[0][0],
            dominantNet: entries[0][1],
          }
        })
        .filter((p): p is PersonBalance => p !== null)
        .sort((a, b) => Math.abs(b.dominantNet) - Math.abs(a.dominantNet))
    },
  })
}
