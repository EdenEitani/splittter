// ─── Domain Types ────────────────────────────────────────────────────────────

export type GroupType = 'trip' | 'house' | 'event' | 'roommates' | 'custom'
export type SplitMethod = 'equal' | 'custom_amounts' | 'percent'
export type ExpenseParticipantRole = 'payer' | 'participant'
export type MemberRole = 'admin' | 'member'

// ─── Database Row Types ───────────────────────────────────────────────────────

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  email?: string
  created_at?: string
}

export interface Group {
  id: string
  name: string
  type: GroupType
  base_currency: string
  created_by: string
  created_at: string
}

export interface GroupMember {
  group_id: string
  user_id: string
  role: MemberRole
  joined_at: string
  profile?: Profile
}

export interface GroupWithMembers extends Group {
  members: GroupMember[]
}

export interface Category {
  id: string
  group_type: GroupType | 'all'
  name: string
  icon: string
  sort_order: number
  color_token: string
}

/**
 * Amounts are stored as BIGINT minor units (cents for most currencies).
 * E.g. USD $12.50 → 1250, JPY ¥100 → 100
 */
export interface Expense {
  id: string
  group_id: string
  created_by: string
  label: string
  notes: string | null
  original_amount: number   // minor units
  original_currency: string
  group_amount: number      // minor units in group base currency
  group_currency: string
  fx_rate: number           // original_amount * fx_rate = group_amount (in major units)
  fx_date: string           // YYYY-MM-DD
  category_id: string | null
  category_confidence: number | null  // 0..1, null if manual
  occurred_at: string
  created_at: string
  // joined
  category?: Category
  participants?: ExpenseParticipant[]
}

export interface ExpenseParticipant {
  expense_id: string
  user_id: string
  role: ExpenseParticipantRole
  weight: number
  share_amount_group_currency: number | null  // computed at creation
  profile?: Profile
}

export interface Payment {
  id: string
  group_id: string
  created_by: string
  from_user_id: string
  to_user_id: string
  original_amount: number   // minor units
  original_currency: string
  group_amount: number      // minor units
  group_currency: string
  fx_rate: number
  fx_date: string
  occurred_at: string
  created_at: string
  notes: string | null
  // joined
  from_profile?: Profile
  to_profile?: Profile
}

export interface FxRate {
  id: string
  base_currency: string
  date: string
  rates_json: Record<string, number>
  provider: string
  created_at: string
}

// ─── Balance Types ────────────────────────────────────────────────────────────

export interface UserBalance {
  user_id: string
  net_minor: number  // positive = owed to them, negative = they owe
  currency: string
  profile: Profile
}

export interface DebtPair {
  from_user_id: string
  to_user_id: string
  amount_minor: number
  currency: string
}

// ─── LLM / Categorization ────────────────────────────────────────────────────

export interface CategorizeResult {
  category_id: string
  confidence: number   // 0..1
  reasoning: string
}

// ─── UI State Types ───────────────────────────────────────────────────────────

export interface ExpenseFormData {
  label: string
  original_amount: string   // user input string, converted on submit
  original_currency: string
  category_id: string | null
  category_confidence: number | null
  notes: string
  occurred_at: string
  payer_ids: string[]       // user ids
  participant_ids: string[] // user ids
  split_method: SplitMethod
  custom_amounts: Record<string, string>  // userId → amount string
  custom_percents: Record<string, string> // userId → percent string
}

export interface PaymentFormData {
  from_user_id: string
  to_user_id: string
  original_amount: string
  original_currency: string
  notes: string
  occurred_at: string
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

export type ActivityItem =
  | { kind: 'expense'; data: Expense }
  | { kind: 'payment'; data: Payment }
