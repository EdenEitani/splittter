import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Group, GroupMember, GroupType, Profile } from '@/types'

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const groupKeys = {
  all: ['groups'] as const,
  detail: (id: string) => ['groups', id] as const,
  members: (id: string) => ['groups', id, 'members'] as const,
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useGroups() {
  return useQuery({
    queryKey: groupKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select(`
          *,
          group_members!inner(user_id)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as Group[]
    },
    staleTime: 1000 * 30,
  })
}

export function useGroup(groupId: string) {
  return useQuery({
    queryKey: groupKeys.detail(groupId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single()

      if (error) throw error
      return data as Group
    },
    enabled: !!groupId,
    staleTime: 1000 * 30,
  })
}

export function useGroupMembers(groupId: string) {
  return useQuery({
    queryKey: groupKeys.members(groupId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('group_members')
        .select(`
          *,
          profile:profiles(*)
        `)
        .eq('group_id', groupId)
        .order('joined_at', { ascending: true })

      if (error) throw error
      return (data as (GroupMember & { profile: Profile })[]).map(m => ({
        ...m,
        profile: m.profile,
      }))
    },
    enabled: !!groupId,
    staleTime: 1000 * 60,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

interface CreateGroupInput {
  name: string
  type: GroupType
  base_currency: string
  memberEmails?: string[]
}

export function useCreateGroup() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, type, base_currency }: CreateGroupInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: group, error } = await supabase
        .from('groups')
        .insert({ name, type, base_currency, created_by: user.id })
        .select()
        .single()

      if (error) throw error

      // Add creator as admin member
      const { error: memberError } = await supabase
        .from('group_members')
        .insert({ group_id: group.id, user_id: user.id, role: 'admin' })

      if (memberError) throw memberError

      return group as Group
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groupKeys.all })
    },
  })
}

export function useAddMember() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      groupId,
      name,
      email,
    }: {
      groupId: string
      name: string
      email?: string
    }) => {
      // Create a guest profile (no auth account needed)
      const guestId = crypto.randomUUID()
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: guestId,
          display_name: name.trim(),
          email: email?.trim().toLowerCase() || null,
          is_guest: true,
        })

      if (profileError) throw profileError

      const { error } = await supabase
        .from('group_members')
        .insert({ group_id: groupId, user_id: guestId, role: 'member' })

      if (error) throw error
    },
    onSuccess: (_data, { groupId }) => {
      qc.invalidateQueries({ queryKey: groupKeys.members(groupId) })
    },
  })
}

export function useUpdateGroup() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      groupId,
      base_currency,
    }: {
      groupId: string
      base_currency: string
    }) => {
      const { error } = await supabase
        .from('groups')
        .update({ base_currency })
        .eq('id', groupId)

      if (error) throw error
    },
    onSuccess: (_data, { groupId }) => {
      qc.invalidateQueries({ queryKey: groupKeys.detail(groupId) })
      qc.invalidateQueries({ queryKey: groupKeys.all })
    },
  })
}

export function useDeleteGroup() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase
        .from('groups')
        .delete()
        .eq('id', groupId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groupKeys.all })
    },
  })
}
