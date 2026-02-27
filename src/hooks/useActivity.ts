import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Expense, Payment } from '@/types'

export type ActivityEntry =
  | { kind: 'expense'; data: Expense & { group?: { id: string; name: string } }; occurred_at: string }
  | { kind: 'payment'; data: Payment & { group?: { id: string; name: string } }; occurred_at: string }

export function useAllActivity(limit = 40) {
  return useQuery({
    queryKey: ['all_activity'],
    staleTime: 1000 * 30,
    queryFn: async () => {
      const [expResult, payResult] = await Promise.all([
        supabase
          .from('expenses')
          .select(`
            *,
            category:categories(*),
            participants:expense_participants(*, profile:profiles(*)),
            group:groups(id, name, base_currency)
          `)
          .order('occurred_at', { ascending: false })
          .limit(limit),
        supabase
          .from('payments')
          .select(`
            *,
            from_profile:profiles!payments_from_user_id_fkey(*),
            to_profile:profiles!payments_to_user_id_fkey(*),
            group:groups(id, name, base_currency)
          `)
          .order('occurred_at', { ascending: false })
          .limit(limit),
      ])

      const expenses: ActivityEntry[] = (expResult.data ?? []).map(e => ({
        kind: 'expense' as const,
        data: e as Expense & { group?: { id: string; name: string } },
        occurred_at: e.occurred_at,
      }))

      const payments: ActivityEntry[] = (payResult.data ?? []).map(p => ({
        kind: 'payment' as const,
        data: p as Payment & { group?: { id: string; name: string } },
        occurred_at: p.occurred_at,
      }))

      return [...expenses, ...payments]
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
        .slice(0, limit)
    },
  })
}
