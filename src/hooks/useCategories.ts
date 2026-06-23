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

      if (!groupType) return data as Category[]

      // Sort group-specific before 'all' at equal sort_order, then deduplicate by name
      const sorted = [...(data as Category[])].sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
        if (a.group_type === groupType && b.group_type === 'all') return -1
        if (a.group_type === 'all' && b.group_type === groupType) return 1
        return 0
      })
      const seen = new Set<string>()
      return sorted.filter(c => {
        const key = c.name.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    },
    staleTime: 1000 * 60 * 60, // 1 hour — rarely changes
  })
}
