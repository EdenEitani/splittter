import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Category, GroupType } from '@/types'

export function useCategories(groupType?: GroupType) {
  return useQuery({
    queryKey: ['categories', groupType],
    queryFn: async () => {
      let query = supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })

      if (groupType) {
        query = query.in('group_type', [groupType, 'all'])
      }

      const { data, error } = await query
      if (error) throw error
      return data as Category[]
    },
    staleTime: 1000 * 60 * 60, // 1 hour — rarely changes
  })
}
