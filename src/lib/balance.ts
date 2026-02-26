import type { Expense, Payment, Profile, UserBalance, DebtPair } from '@/types'

/**
 * Compute per-user net balances for a group.
 *
 * Net balance > 0  → others owe this user
 * Net balance < 0  → this user owes others
 * Net balance = 0  → settled
 *
 * Uses integer minor-unit arithmetic to avoid floating point drift.
 */
export function computeBalances(
  expenses: Expense[],
  payments: Payment[],
  members: { user_id: string; profile: Profile }[],
  currency: string
): UserBalance[] {
  const net = new Map<string, number>()

  // Initialize all members
  for (const m of members) {
    net.set(m.user_id, 0)
  }

  // Process expenses
  for (const exp of expenses) {
    const parts = exp.participants ?? []
    const payers = parts.filter(p => p.role === 'payer')
    const participants = parts.filter(p => p.role === 'participant')

    // Credit payers: each gets their paid share_amount
    for (const payer of payers) {
      const paid = payer.share_amount_group_currency ?? 0
      net.set(payer.user_id, (net.get(payer.user_id) ?? 0) + paid)
    }

    // Debit participants: each owes their share_amount
    for (const pt of participants) {
      const owed = pt.share_amount_group_currency ?? 0
      net.set(pt.user_id, (net.get(pt.user_id) ?? 0) - owed)
    }
  }

  // Process payments
  for (const pay of payments) {
    // from_user paid to_user → from_user's balance improves (debt reduced)
    net.set(pay.from_user_id, (net.get(pay.from_user_id) ?? 0) + pay.group_amount)
    // to_user received money → their balance decreases (they got what was owed)
    net.set(pay.to_user_id, (net.get(pay.to_user_id) ?? 0) - pay.group_amount)
  }

  // Build result
  return members.map(m => ({
    user_id: m.user_id,
    net_minor: net.get(m.user_id) ?? 0,
    currency,
    profile: m.profile,
  }))
}

/**
 * Simplified debt pairs using greedy algorithm.
 * Minimizes number of transactions needed to settle the group.
 */
export function simplifyDebts(balances: UserBalance[]): DebtPair[] {
  const debts: DebtPair[] = []

  // Clone and filter out zeros
  const creditors = balances
    .filter(b => b.net_minor > 0)
    .map(b => ({ ...b }))
    .sort((a, b) => b.net_minor - a.net_minor)

  const debtors = balances
    .filter(b => b.net_minor < 0)
    .map(b => ({ ...b, net_minor: -b.net_minor }))  // flip to positive
    .sort((a, b) => b.net_minor - a.net_minor)

  let ci = 0
  let di = 0

  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci]
    const d = debtors[di]
    const amount = Math.min(c.net_minor, d.net_minor)

    if (amount > 0) {
      debts.push({
        from_user_id: d.user_id,
        to_user_id: c.user_id,
        amount_minor: amount,
        currency: c.currency,
      })
    }

    c.net_minor -= amount
    d.net_minor -= amount

    if (c.net_minor === 0) ci++
    if (d.net_minor === 0) di++
  }

  return debts
}

/**
 * Compute participant share amounts for an expense.
 * Returns a map of userId → share_amount_minor (in group currency).
 */
export function computeParticipantShares(
  participantIds: string[],
  totalMinor: number,
  splitMethod: 'equal' | 'custom_amounts' | 'percent',
  customAmounts?: Record<string, number>,  // minor units
  customPercents?: Record<string, number>  // 0..100
): Record<string, number> {
  const shares: Record<string, number> = {}
  const n = participantIds.length
  if (n === 0) return shares

  if (splitMethod === 'equal') {
    const base = Math.floor(totalMinor / n)
    const remainder = totalMinor - base * n
    for (let i = 0; i < n; i++) {
      shares[participantIds[i]] = base + (i < remainder ? 1 : 0)
    }
  } else if (splitMethod === 'custom_amounts' && customAmounts) {
    for (const id of participantIds) {
      shares[id] = customAmounts[id] ?? 0
    }
  } else if (splitMethod === 'percent' && customPercents) {
    let assigned = 0
    const last = participantIds[n - 1]
    for (let i = 0; i < n - 1; i++) {
      const id = participantIds[i]
      const pct = customPercents[id] ?? 0
      const amount = Math.round((totalMinor * pct) / 100)
      shares[id] = amount
      assigned += amount
    }
    shares[last] = totalMinor - assigned
  }

  return shares
}
