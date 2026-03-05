import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Group, GroupMember, GroupType, GroupWithMembers, Profile } from '@/types'
import { offlineDb, isOffline } from '@/offline'

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
    networkMode: 'always',
    queryFn: async () => {
      if (isOffline()) {
        const cached = await offlineDb.groups.orderBy('created_at').reverse().toArray()
        return cached as unknown as GroupWithMembers[]
      }

      try {
        const { data, error } = await supabase
          .from('groups')
          .select(`
            *,
            members:group_members(
              user_id,
              role,
              joined_at,
              profile:profiles(id, display_name, avatar_url, is_guest)
            )
          `)
          .order('created_at', { ascending: false })

        if (error) throw error
        if (!data?.length) return [] as GroupWithMembers[]

        // Fetch the earliest expense date per group (for imported groups whose
        // created_at is "now" but expenses are from the past)
        const { data: expDates } = await supabase
          .from('expenses')
          .select('group_id, occurred_at')
          .in('group_id', data.map(g => g.id))
          .order('occurred_at', { ascending: true })

        // Build min-date map: first row per group (already sorted asc)
        const minExpDate: Record<string, string> = {}
        for (const e of expDates ?? []) {
          if (!minExpDate[e.group_id]) minExpDate[e.group_id] = e.occurred_at
        }

        // Sort: use min expense date if earlier than created_at (imported groups),
        // otherwise use created_at. Descending (most recent first).
        const sorted = [...data].sort((a, b) => {
          const dA = minExpDate[a.id] && minExpDate[a.id] < a.created_at
            ? minExpDate[a.id]
            : a.created_at
          const dB = minExpDate[b.id] && minExpDate[b.id] < b.created_at
            ? minExpDate[b.id]
            : b.created_at
          return dB.localeCompare(dA)
        })

        // Cache groups to IndexedDB (store base Group rows, not the full joins)
        const groupRows = sorted.map(g => ({
          id: g.id, name: g.name, type: g.type,
          base_currency: g.base_currency, emoji: g.emoji ?? null,
          created_by: g.created_by, created_at: g.created_at,
        }))
        await offlineDb.groups.bulkPut(groupRows)

        return sorted as unknown as GroupWithMembers[]
      } catch {
        const cached = await offlineDb.groups.orderBy('created_at').reverse().toArray()
        return cached as unknown as GroupWithMembers[]
      }
    },
    staleTime: 1000 * 30,
  })
}

export function useGroup(groupId: string) {
  return useQuery({
    queryKey: groupKeys.detail(groupId),
    networkMode: 'always',
    queryFn: async () => {
      if (isOffline()) {
        const cached = await offlineDb.groups.get(groupId)
        if (cached) return cached as Group
      }

      try {
        const { data, error } = await supabase
          .from('groups')
          .select('*')
          .eq('id', groupId)
          .single()

        if (error) throw error
        await offlineDb.groups.put(data)
        return data as Group
      } catch {
        const cached = await offlineDb.groups.get(groupId)
        if (cached) return cached as Group
        throw new Error('Group not available offline')
      }
    },
    enabled: !!groupId,
    staleTime: 1000 * 30,
  })
}

export function useGroupMembers(groupId: string) {
  return useQuery({
    queryKey: groupKeys.members(groupId),
    networkMode: 'always',
    queryFn: async () => {
      if (isOffline()) {
        const cached = await offlineDb.groupMembers.where('group_id').equals(groupId).toArray()
        return cached as (GroupMember & { profile: Profile })[]
      }

      try {
        const { data, error } = await supabase
          .from('group_members')
          .select(`
            *,
            profile:profiles(*)
          `)
          .eq('group_id', groupId)
          .order('joined_at', { ascending: true })

        if (error) throw error
        const members = (data as (GroupMember & { profile: Profile })[]).map(m => ({
          ...m,
          profile: m.profile,
        }))

        // Cache to IndexedDB
        await offlineDb.groupMembers.bulkPut(members)

        return members
      } catch {
        const cached = await offlineDb.groupMembers.where('group_id').equals(groupId).toArray()
        return cached as (GroupMember & { profile: Profile })[]
      }
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
      name,
      base_currency,
      type,
      emoji,
    }: {
      groupId: string
      name?: string
      base_currency?: string
      type?: GroupType
      emoji?: string | null
    }) => {
      const update: Record<string, string | null> = {}
      if (name !== undefined) update.name = name
      if (base_currency !== undefined) update.base_currency = base_currency
      if (type !== undefined) update.type = type
      if (emoji !== undefined) update.emoji = emoji

      const { error } = await supabase
        .from('groups')
        .update(update)
        .eq('id', groupId)

      if (error) throw error
    },
    onSuccess: (_data, { groupId }) => {
      qc.invalidateQueries({ queryKey: groupKeys.detail(groupId) })
      qc.invalidateQueries({ queryKey: groupKeys.all })
    },
  })
}

// ─── Balance across all groups ────────────────────────────────────────────────

export interface GroupNetBalance {
  groupId: string
  net: number
  currency: string
}

export function useUserGroupsBalance(userId: string | undefined) {
  return useQuery({
    queryKey: ['user_groups_balance', userId],
    enabled: !!userId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const nets: Record<string, GroupNetBalance> = {}

      const [expResult, payResult] = await Promise.all([
        supabase
          .from('expense_participants')
          .select('role, share_amount_group_currency, expense:expenses!inner(group_id, group_currency)')
          .eq('user_id', userId!),
        supabase
          .from('payments')
          .select('group_id, group_amount, group_currency, from_user_id, to_user_id')
          .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`),
      ])

      type ExpRow = {
        role: string
        share_amount_group_currency: number | null
        expense: { group_id: string; group_currency: string } | null
      }

      for (const ep of ((expResult.data ?? []) as unknown as ExpRow[])) {
        if (!ep.expense) continue
        const groupId = ep.expense.group_id
        const currency = ep.expense.group_currency
        if (!nets[groupId]) nets[groupId] = { groupId, net: 0, currency }
        if (ep.role === 'payer') {
          nets[groupId].net += ep.share_amount_group_currency ?? 0
        } else {
          nets[groupId].net -= ep.share_amount_group_currency ?? 0
        }
      }

      type PayRow = {
        group_id: string
        group_amount: number
        group_currency: string
        from_user_id: string
        to_user_id: string
      }

      for (const pay of ((payResult.data ?? []) as unknown as PayRow[])) {
        if (!nets[pay.group_id]) {
          nets[pay.group_id] = { groupId: pay.group_id, net: 0, currency: pay.group_currency }
        }
        if (pay.from_user_id === userId) {
          nets[pay.group_id].net += pay.group_amount
        } else {
          nets[pay.group_id].net -= pay.group_amount
        }
      }

      return nets
    },
  })
}

export function useUpdateMemberProfile() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      userId,
      display_name,
      email,
    }: {
      userId: string
      groupId: string
      display_name?: string
      email?: string
    }) => {
      const update: Record<string, string | null> = {}
      if (display_name !== undefined) update.display_name = display_name.trim()
      if (email !== undefined) update.email = email.trim().toLowerCase() || null

      const { error } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: (_data, { groupId }) => {
      qc.invalidateQueries({ queryKey: groupKeys.members(groupId) })
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
