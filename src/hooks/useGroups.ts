import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import type { Group, GroupMember, GroupType, GroupWithMembers, Profile } from '@/types'
import { offlineDb, isOffline } from '@/offline'
import { firebaseAuth, firestore } from '@/lib/firebase'

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
        const uid = firebaseAuth.currentUser?.uid
        if (!uid) throw new Error('Not authenticated')

        const membershipSnaps = await getDocs(collection(firestore, 'groups'))
        const memberGroupIds: string[] = []
        for (const groupDoc of membershipSnaps.docs) {
          const memberSnap = await getDoc(doc(firestore, 'groups', groupDoc.id, 'members', uid))
          if (memberSnap.exists()) memberGroupIds.push(groupDoc.id)
        }

        if (!memberGroupIds.length) return [] as GroupWithMembers[]

        const groupsWithMembers: GroupWithMembers[] = []
        const minExpDate: Record<string, string> = {}

        for (const groupId of memberGroupIds) {
          const groupSnap = await getDoc(doc(firestore, 'groups', groupId))
          if (!groupSnap.exists()) continue
          const g = groupSnap.data()
          if (g.archived) continue

          const membersSnap = await getDocs(collection(firestore, 'groups', groupId, 'members'))
          const members: GroupMember[] = []
          for (const m of membersSnap.docs) {
            const member = m.data()
            const profileSnap = await getDoc(doc(firestore, 'profiles', member.userId))
            const profileData = profileSnap.exists() ? profileSnap.data() : null
            members.push({
              group_id: groupId,
              user_id: member.userId,
              role: member.role,
              joined_at: member.joinedAt,
              profile: profileData ? {
                id: member.userId,
                display_name: profileData.displayName ?? 'User',
                avatar_url: profileData.avatarUrl ?? null,
                is_guest: !!profileData.isGuest,
                email: profileData.email ?? undefined,
              } : undefined,
            })
          }

          const expenseSnap = await getDocs(
            query(
              collection(firestore, 'expenses'),
              where('groupId', '==', groupId),
              orderBy('occurredAt', 'asc'),
              limit(1),
            ),
          )
          const firstExpense = expenseSnap.docs[0]?.data()?.occurredAt
          if (firstExpense) minExpDate[groupId] = firstExpense

          groupsWithMembers.push({
            id: groupId,
            name: g.name,
            type: g.type,
            base_currency: g.baseCurrency,
            emoji: g.emoji ?? null,
            created_by: g.createdBy,
            created_at: g.createdAt,
            inbound_email_token: g.inboundEmailToken,
            bill_default_payer_id: g.billDefaultPayerId,
            exclude_from_totals: !!g.excludeFromTotals,
            invite_token: g.inviteToken,
            archived: !!g.archived,
            members,
          })
        }

        // Sort: use min expense date if earlier than created_at (imported groups),
        // otherwise use created_at. Descending (most recent first).
        const sorted = [...groupsWithMembers].sort((a, b) => {
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

export function useArchivedGroups() {
  return useQuery({
    queryKey: [...groupKeys.all, 'archived'],
    queryFn: async () => {
      const uid = firebaseAuth.currentUser?.uid
      if (!uid) throw new Error('Not authenticated')

      const groupsSnap = await getDocs(query(collection(firestore, 'groups'), orderBy('createdAt', 'desc')))
      const archived: GroupWithMembers[] = []

      for (const groupDoc of groupsSnap.docs) {
        const memberSnap = await getDoc(doc(firestore, 'groups', groupDoc.id, 'members', uid))
        if (!memberSnap.exists()) continue

        const g = groupDoc.data()
        if (!g.archived) continue
        archived.push({
          id: groupDoc.id,
          name: g.name,
          type: g.type,
          base_currency: g.baseCurrency,
          emoji: g.emoji ?? null,
          created_by: g.createdBy,
          created_at: g.createdAt,
          inbound_email_token: g.inboundEmailToken,
          bill_default_payer_id: g.billDefaultPayerId,
          exclude_from_totals: !!g.excludeFromTotals,
          invite_token: g.inviteToken,
          archived: true,
          members: [],
        })
      }

      return archived
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
        const groupSnap = await getDoc(doc(firestore, 'groups', groupId))
        if (!groupSnap.exists()) throw new Error('Group not found')
        const g = groupSnap.data()
        const data: Group = {
          id: groupId,
          name: g.name,
          type: g.type,
          base_currency: g.baseCurrency,
          emoji: g.emoji ?? null,
          created_by: g.createdBy,
          created_at: g.createdAt,
          inbound_email_token: g.inboundEmailToken,
          bill_default_payer_id: g.billDefaultPayerId,
          exclude_from_totals: !!g.excludeFromTotals,
          invite_token: g.inviteToken,
          archived: !!g.archived,
        }
        await offlineDb.groups.put(data)
        return data
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
        const membersSnap = await getDocs(query(collection(firestore, 'groups', groupId, 'members'), orderBy('joinedAt', 'asc')))
        const members: (GroupMember & { profile: Profile })[] = []
        for (const m of membersSnap.docs) {
          const row = m.data()
          const profileSnap = await getDoc(doc(firestore, 'profiles', row.userId))
          const p = profileSnap.exists() ? profileSnap.data() : null
          members.push({
            group_id: groupId,
            user_id: row.userId,
            role: row.role,
            joined_at: row.joinedAt,
            profile: {
              id: row.userId,
              display_name: p?.displayName ?? 'User',
              avatar_url: p?.avatarUrl ?? null,
              email: p?.email ?? undefined,
              is_guest: !!p?.isGuest,
            },
          })
        }

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
      const user = firebaseAuth.currentUser
      if (!user) throw new Error('Not authenticated')

      const groupRef = await addDoc(collection(firestore, 'groups'), {
        name,
        type,
        baseCurrency: base_currency,
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
        emoji: null,
        inboundEmailToken: crypto.randomUUID(),
        billDefaultPayerId: null,
        excludeFromTotals: false,
        inviteToken: crypto.randomUUID(),
        archived: false,
      })

      await setDoc(doc(firestore, 'groups', groupRef.id, 'members', user.uid), {
        userId: user.uid,
        role: 'admin',
        joinedAt: new Date().toISOString(),
      })

      return {
        id: groupRef.id,
        name,
        type,
        base_currency,
        created_by: user.uid,
        created_at: new Date().toISOString(),
      } as Group
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
      await setDoc(doc(firestore, 'profiles', guestId), {
        displayName: name.trim(),
        email: email?.trim().toLowerCase() || null,
        isGuest: true,
        avatarUrl: null,
        createdAt: new Date().toISOString(),
      })

      await setDoc(doc(firestore, 'groups', groupId, 'members', guestId), {
        userId: guestId,
        role: 'member',
        joinedAt: new Date().toISOString(),
      })
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
      bill_default_payer_id,
      exclude_from_totals,
      archived,
    }: {
      groupId: string
      name?: string
      base_currency?: string
      type?: GroupType
      emoji?: string | null
      bill_default_payer_id?: string | null
      exclude_from_totals?: boolean
      archived?: boolean
    }) => {
      const update: Record<string, string | boolean | null> = {}
      if (name !== undefined) update.name = name
      if (base_currency !== undefined) update.base_currency = base_currency
      if (type !== undefined) update.type = type
      if (emoji !== undefined) update.emoji = emoji
      if (bill_default_payer_id !== undefined) update.bill_default_payer_id = bill_default_payer_id
      if (exclude_from_totals !== undefined) update.exclude_from_totals = exclude_from_totals
      if (archived !== undefined) update.archived = archived

      const mapped: Record<string, string | boolean | null> = {}
      if (update.name !== undefined) mapped.name = update.name as string
      if (update.base_currency !== undefined) mapped.baseCurrency = update.base_currency as string
      if (update.type !== undefined) mapped.type = update.type as string
      if (update.emoji !== undefined) mapped.emoji = update.emoji as string | null
      if (update.bill_default_payer_id !== undefined) mapped.billDefaultPayerId = update.bill_default_payer_id as string | null
      if (update.exclude_from_totals !== undefined) mapped.excludeFromTotals = !!update.exclude_from_totals
      if (update.archived !== undefined) mapped.archived = !!update.archived
      await updateDoc(doc(firestore, 'groups', groupId), mapped)
    },
    onSuccess: (_data, { groupId }) => {
      qc.invalidateQueries({ queryKey: groupKeys.detail(groupId) })
      qc.invalidateQueries({ queryKey: groupKeys.all })
    },
  })
}

export function useRegenerateInboundToken(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const newToken = crypto.randomUUID()
      await updateDoc(doc(firestore, 'groups', groupId), { inboundEmailToken: newToken })
      return newToken
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groupKeys.detail(groupId) })
    },
  })
}

// ─── Balance across all groups ────────────────────────────────────────────────

export interface GroupNetBalance {
  groupId: string
  net: number
  currency: string
}

export function useGroupsYearlyTotals() {
  const year = new Date().getFullYear()
  return useQuery({
    queryKey: ['groups_yearly_totals', year],
    staleTime: 1000 * 60,
    queryFn: async () => {
      const snapshot = await getDocs(query(
        collection(firestore, 'expenses'),
        where('occurredAt', '>=', `${year}-01-01`),
        where('occurredAt', '<', `${year + 1}-01-01`),
      ))
      const totals: Record<string, number> = {}
      for (const docSnap of snapshot.docs) {
        const row = docSnap.data()
        totals[row.groupId] = (totals[row.groupId] ?? 0) + (row.groupAmount ?? 0)
      }
      return totals
    },
  })
}

export function useUserGroupsBalance(userId: string | undefined) {
  return useQuery({
    queryKey: ['user_groups_balance', userId],
    enabled: !!userId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const nets: Record<string, GroupNetBalance> = {}

      const [expenseSnap, paymentsFromSnap, paymentsToSnap] = await Promise.all([
        getDocs(collection(firestore, 'expenses')),
        getDocs(query(collection(firestore, 'payments'), where('fromUserId', '==', userId!))),
        getDocs(query(collection(firestore, 'payments'), where('toUserId', '==', userId!))),
      ])

      for (const expDoc of expenseSnap.docs) {
        const expense = expDoc.data()
        const partsSnap = await getDocs(collection(firestore, 'expenses', expDoc.id, 'participants'))
        for (const p of partsSnap.docs) {
          const ep = p.data()
          if (ep.userId !== userId) continue
          const groupId = expense.groupId
          const currency = expense.groupCurrency
          if (!nets[groupId]) nets[groupId] = { groupId, net: 0, currency }
          if (ep.role === 'payer') {
            nets[groupId].net += ep.shareAmountGroupCurrency ?? 0
          } else {
            nets[groupId].net -= ep.shareAmountGroupCurrency ?? 0
          }
        }
      }

      const paymentRows = [...paymentsFromSnap.docs, ...paymentsToSnap.docs].map((d) => d.data())

      for (const pay of paymentRows) {
        if (!nets[pay.groupId]) {
          nets[pay.groupId] = { groupId: pay.groupId, net: 0, currency: pay.groupCurrency }
        }
        if (pay.fromUserId === userId) {
          nets[pay.groupId].net += pay.groupAmount
        } else {
          nets[pay.groupId].net -= pay.groupAmount
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

      await updateDoc(doc(firestore, 'profiles', userId), {
        ...(update.display_name !== undefined ? { displayName: update.display_name } : {}),
        ...(update.email !== undefined ? { email: update.email } : {}),
      })
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
      const batch = writeBatch(firestore)
      const membersSnap = await getDocs(collection(firestore, 'groups', groupId, 'members'))
      membersSnap.forEach((m) => batch.delete(m.ref))
      batch.delete(doc(firestore, 'groups', groupId))
      await batch.commit()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groupKeys.all })
    },
  })
}
