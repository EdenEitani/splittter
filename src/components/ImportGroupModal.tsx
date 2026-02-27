import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, X, FileText, AlertCircle, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { toMinorUnits, convertAmount } from '@/lib/money'
import { getFxRate, todayISO } from '@/lib/fx'
import { useQueryClient } from '@tanstack/react-query'
import { groupKeys } from '@/hooks/useGroups'
import type { GroupType } from '@/types'

// ── CSV parsing ────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

interface ParsedExpense {
  date: string
  description: string
  category: string
  amount: number
  currency: string
  payerName: string
  memberAmounts: Record<string, number>
}

interface ParsedPayment {
  date: string
  amount: number
  currency: string
  fromName: string   // who paid (by column)
  toName: string     // who received (member with positive value)
  notes: string
}

interface ParsedCSV {
  groupName: string
  currency: string
  members: string[]
  expenses: ParsedExpense[]
  payments: ParsedPayment[]
}

function parseCSV(content: string): ParsedCSV {
  const lines = content.split(/\r?\n/)
  let groupName = 'Imported Group'
  let currency = 'USD'
  let headerParsed = false
  let members: string[] = []
  const expenses: ParsedExpense[] = []
  const payments: ParsedPayment[] = []

  for (const line of lines) {
    if (!line.trim()) continue

    if (line.startsWith('#')) {
      const match = line.match(/^#\s*([^:]+):\s*(.+)$/)
      if (match) {
        const key = match[1].trim()
        const val = match[2].trim()
        if (key === 'Group') groupName = val
        if (key === 'Currency') currency = val
      }
      continue
    }

    if (!headerParsed) {
      const cols = parseCSVLine(line)
      // Columns: date,type,description,category,amount,currency,exchangeRate,by,[member1],[member2],...
      members = cols.slice(8).filter(m => m.trim())
      headerParsed = true
      continue
    }

    const parts = parseCSVLine(line)
    if (parts.length < 4) continue

    const rowType = parts[1]?.toUpperCase()
    const date = parts[0] || todayISO()
    const rowCurrency = parts[5] || currency
    const byName = parts[7] || ''

    if (rowType === 'EXPENSE') {
      const description = parts[2] || ''
      const category = parts[3] || 'OTHER'
      const amount = parseFloat(parts[4]) || 0
      const memberAmounts: Record<string, number> = {}
      for (let i = 0; i < members.length; i++) {
        const val = parseFloat(parts[8 + i])
        if (!isNaN(val) && val !== 0) memberAmounts[members[i]] = val
      }
      if (amount > 0 && description && byName) {
        expenses.push({ date, description, category, amount, currency: rowCurrency, payerName: byName, memberAmounts })
      }
    } else if (rowType === 'PAYMENT') {
      const amount = parseFloat(parts[4]) || 0
      const description = parts[2] || ''
      // The recipient is the member with a non-zero value in their column
      let toName = ''
      for (let i = 0; i < members.length; i++) {
        const val = parseFloat(parts[8 + i])
        if (!isNaN(val) && val !== 0) {
          toName = members[i]
          break
        }
      }
      if (amount > 0 && byName && toName) {
        payments.push({ date, amount, currency: rowCurrency, fromName: byName, toName, notes: description })
      }
    }
  }

  return { groupName, currency, members, expenses, payments }
}

// ── Fuzzy category matching ────────────────────────────────────────────────────

const CATEGORY_ALIASES: Record<string, string> = {
  'other': 'general',
  'misc': 'general',
  'miscellaneous': 'general',
  'transportation': 'transport',
  'travel': 'transport',
  'flights': 'flights',
  'flight': 'flights',
  'food': 'food',
  'meal': 'food',
  'restaurant': 'food',
  'beverages': 'drinks',
  'alcohol': 'drinks',
  'accommodation': 'lodging',
  'hotel': 'hotel',
  'lodging': 'lodging',
  'housing': 'rent',
  'lease': 'rent',
  'rent': 'rent',
  'utilities': 'utilities',
  'electric': 'electricity',
  'internet': 'internet',
  'wifi': 'internet',
  'grocery': 'groceries',
  'supermarket': 'groceries',
  'shopping': 'shopping',
  'entertainment': 'activities',
  'activity': 'activities',
  'gift': 'gifts',
  'health': 'general',
  'medical': 'general',
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function fuzzyMatchCategory(
  csvCategory: string,
  categories: { id: string; name: string }[]
): string | null {
  if (!categories.length) return null
  const csvNorm = norm(csvCategory)

  // 1. Exact normalised match
  let match = categories.find(c => norm(c.name) === csvNorm)
  if (match) return match.id

  // 2. Known alias
  const alias = CATEGORY_ALIASES[csvNorm]
  if (alias) {
    match = categories.find(c => norm(c.name) === alias)
    if (match) return match.id
  }

  // 3. Contains match (prefer longest category name that fits)
  const containsMatches = categories
    .filter(c => {
      const cn = norm(c.name)
      return csvNorm.includes(cn) || cn.includes(csvNorm)
    })
    .sort((a, b) => b.name.length - a.name.length)
  if (containsMatches.length) return containsMatches[0].id

  // 4. Starts-with match
  match = categories.find(c => {
    const cn = norm(c.name)
    return csvNorm.startsWith(cn) || cn.startsWith(csvNorm)
  })
  if (match) return match.id

  // 5. Token overlap
  const csvTokens = csvNorm.split(/(?=[A-Z])|_|-/).filter(Boolean)
  let best: { id: string; score: number } | null = null
  for (const cat of categories) {
    const catTokens = norm(cat.name).split(/(?=[A-Z])|_|-/).filter(Boolean)
    const overlap = csvTokens.filter(t => catTokens.some(ct => ct.startsWith(t) || t.startsWith(ct))).length
    const score = overlap / Math.max(csvTokens.length, catTokens.length)
    if (score > 0.4 && (!best || score > best.score)) {
      best = { id: cat.id, score }
    }
  }
  if (best) return best.id

  // 6. Fallback to 'General' or 'Other'
  const fallback = categories.find(c => norm(c.name) === 'general' || norm(c.name) === 'other')
  return fallback?.id ?? null
}

// ── Fuzzy member name resolver ─────────────────────────────────────────────────
// The 'by' column in Purrse CSVs may use short names/first names (e.g. 'Reut')
// while member column headers use full names or emails ('Reut118tobol@gmail.com').
// This function resolves the short name to the correct memberIdMap key.
function resolveId(name: string, memberIdMap: Record<string, string>): string | null {
  if (!name) return null
  // 1. Exact match
  if (memberIdMap[name] !== undefined) return memberIdMap[name]
  const lower = name.toLowerCase()
  // 2. Case-insensitive exact
  for (const [key, id] of Object.entries(memberIdMap))
    if (key.toLowerCase() === lower) return id
  // 3. Name is prefix of member key  e.g. 'Reut' → 'Reut118tobol@gmail.com'
  for (const [key, id] of Object.entries(memberIdMap))
    if (key.toLowerCase().startsWith(lower)) return id
  // 4. Member key is prefix of name
  for (const [key, id] of Object.entries(memberIdMap))
    if (lower.startsWith(key.toLowerCase())) return id
  // 5. Either contains the other
  for (const [key, id] of Object.entries(memberIdMap))
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) return id
  return null
}

// ── Modal component ────────────────────────────────────────────────────────────

interface ImportGroupModalProps {
  onClose: () => void
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'done' | 'error'

export function ImportGroupModal({ onClose }: ImportGroupModalProps) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<ImportStep>('upload')
  const [parsed, setParsed] = useState<ParsedCSV | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [progress, setProgress] = useState('')
  const [importedGroupId, setImportedGroupId] = useState('')

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const content = ev.target?.result as string
        const result = parseCSV(content)
        if (!result.members.length) {
          setErrorMsg('No members found in CSV. Check the file format.')
          setStep('error')
          return
        }
        setParsed(result)
        setStep('preview')
      } catch {
        setErrorMsg('Failed to parse CSV. Check the file format.')
        setStep('error')
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  async function handleImport() {
    if (!parsed) return
    setStep('importing')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      setProgress('Creating group…')

      // 1. Create group
      const { data: group, error: groupErr } = await supabase
        .from('groups')
        .insert({
          name: parsed.groupName,
          type: 'custom' as GroupType,
          base_currency: parsed.currency,
          created_by: user.id,
        })
        .select()
        .single()

      if (groupErr) throw groupErr

      // Add current user as admin
      await supabase
        .from('group_members')
        .insert({ group_id: group.id, user_id: user.id, role: 'admin' })

      // 2. Create guest profiles for each member
      setProgress('Creating members…')
      const memberIdMap: Record<string, string> = {}

      // Fetch current user profile to check name match
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single()

      const myName = myProfile?.display_name ?? ''

      for (const memberName of parsed.members) {
        if (memberName.trim() === myName.trim()) {
          // Map to current user
          memberIdMap[memberName] = user.id
        } else {
          const guestId = crypto.randomUUID()
          const { error: profileErr } = await supabase
            .from('profiles')
            .insert({ id: guestId, display_name: memberName.trim(), is_guest: true })

          if (profileErr) throw profileErr

          await supabase
            .from('group_members')
            .insert({ group_id: group.id, user_id: guestId, role: 'member' })

          memberIdMap[memberName] = guestId
        }
      }

      // 3. Fetch categories for mapping (fetch all types for best coverage)
      const { data: categories } = await supabase
        .from('categories')
        .select('id, name')

      const catList = (categories ?? []) as { id: string; name: string }[]

      // 4. Create expenses
      const fxDate = todayISO()
      let expCount = 0

      for (const exp of parsed.expenses) {
        setProgress(`Importing expense ${++expCount} of ${parsed.expenses.length}…`)

        const payerId = resolveId(exp.payerName, memberIdMap)
        if (!payerId) continue

        // FX conversion
        const fxRate = await getFxRate(exp.currency, parsed.currency, fxDate)
        const originalMinor = toMinorUnits(exp.amount, exp.currency)
        const groupMinor = convertAmount(originalMinor, fxRate)

        // Category lookup via fuzzy match
        const categoryId = fuzzyMatchCategory(exp.category, catList)

        // Create expense
        const { data: expense, error: expErr } = await supabase
          .from('expenses')
          .insert({
            group_id: group.id,
            created_by: user.id,
            label: exp.description,
            original_amount: originalMinor,
            original_currency: exp.currency,
            group_amount: groupMinor,
            group_currency: parsed.currency,
            fx_rate: fxRate,
            fx_date: fxDate,
            category_id: categoryId,
            category_confidence: null,
            occurred_at: exp.date,
            notes: null,
          })
          .select()
          .single()

        if (expErr) throw expErr

        // Build participant rows
        const participantRows: {
          expense_id: string
          user_id: string
          role: 'payer' | 'participant'
          weight: number
          share_amount_group_currency: number
        }[] = []

        // Payer row
        participantRows.push({
          expense_id: expense.id,
          user_id: payerId,
          role: 'payer',
          weight: 1,
          share_amount_group_currency: groupMinor,
        })

        // Participant rows
        const memberEntries = Object.entries(exp.memberAmounts)
        const totalAssigned = memberEntries.reduce((s, [, v]) => s + v, 0)

        for (let i = 0; i < memberEntries.length; i++) {
          const [memberName, memberAmt] = memberEntries[i]
          const memberId = resolveId(memberName, memberIdMap)
          if (!memberId) continue

          // Convert member amount proportionally
          const shareMinor = totalAssigned > 0
            ? Math.round(groupMinor * memberAmt / totalAssigned)
            : Math.round(groupMinor / memberEntries.length)

          participantRows.push({
            expense_id: expense.id,
            user_id: memberId,
            role: 'participant',
            weight: 1,
            share_amount_group_currency: shareMinor,
          })
        }

        await supabase.from('expense_participants').insert(participantRows)
      }

      // 5. Create payments (settle-up records)
      let payCount = 0
      for (const pay of parsed.payments) {
        setProgress(`Importing payment ${++payCount} of ${parsed.payments.length}…`)

        const fromId = resolveId(pay.fromName, memberIdMap)
        const toId = resolveId(pay.toName, memberIdMap)
        if (!fromId || !toId) continue

        const fxRate = await getFxRate(pay.currency, parsed.currency, fxDate)
        const originalMinor = toMinorUnits(pay.amount, pay.currency)
        const groupMinor = convertAmount(originalMinor, fxRate)

        await supabase.from('payments').insert({
          group_id: group.id,
          created_by: user.id,
          from_user_id: fromId,
          to_user_id: toId,
          original_amount: originalMinor,
          original_currency: pay.currency,
          group_amount: groupMinor,
          group_currency: parsed.currency,
          fx_rate: fxRate,
          fx_date: fxDate,
          occurred_at: pay.date,
          notes: pay.notes || null,
        })
      }

      setImportedGroupId(group.id)
      qc.invalidateQueries({ queryKey: groupKeys.all })
      setStep('done')
    } catch (err) {
      setErrorMsg((err as Error).message)
      setStep('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Import Group from CSV</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Upload step */}
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Import a group from a Purrse-format CSV file. Members, expenses, and balances will be created automatically.
              </p>
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-2xl p-8 flex flex-col items-center gap-3 hover:border-blue-300 hover:bg-blue-50 transition-all group"
              >
                <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <Upload size={24} className="text-blue-600" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-gray-700">Click to select CSV file</p>
                  <p className="text-xs text-gray-400 mt-1">Supports Purrse export format</p>
                </div>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.CSV"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1">
                <p className="font-medium text-gray-600">Expected CSV format:</p>
                <p className="font-mono">date, type, description, category, amount, currency, exchangeRate, by, [members…]</p>
              </div>
            </div>
          )}

          {/* Preview step */}
          {step === 'preview' && parsed && (
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-xl p-4 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Group name</span>
                  <span className="font-semibold text-gray-900">{parsed.groupName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Currency</span>
                  <span className="font-semibold text-gray-900">{parsed.currency}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Members</span>
                  <span className="font-semibold text-gray-900">{parsed.members.join(', ')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Expenses to import</span>
                  <span className="font-semibold text-gray-900">{parsed.expenses.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Payments to import</span>
                  <span className="font-semibold text-gray-900">{parsed.payments.length}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Expenses preview</p>
                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                  {parsed.expenses.slice(0, 20).map((exp, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <FileText size={13} className="text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{exp.description}</p>
                        <p className="text-[11px] text-gray-400">{exp.date} · by {exp.payerName}</p>
                      </div>
                      <span className="text-xs font-semibold text-gray-700">
                        {exp.amount} {exp.currency}
                      </span>
                    </div>
                  ))}
                  {parsed.expenses.length > 20 && (
                    <p className="text-xs text-gray-400 text-center py-1">+{parsed.expenses.length - 20} more</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Importing step */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className="w-14 h-14 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm text-gray-600 text-center">{progress}</p>
            </div>
          )}

          {/* Done step */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle size={28} className="text-green-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-gray-900">Import complete!</p>
                <p className="text-sm text-gray-500 mt-1">
                  {parsed?.expenses.length} expenses and {parsed?.payments.length} payments imported successfully.
                </p>
              </div>
            </div>
          )}

          {/* Error step */}
          {step === 'error' && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle size={28} className="text-red-500" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-gray-900">Import failed</p>
                <p className="text-sm text-red-500 mt-1">{errorMsg}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
          {step === 'upload' && (
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
          )}
          {step === 'preview' && (
            <>
              <Button variant="secondary" onClick={() => setStep('upload')}>Back</Button>
              <Button onClick={handleImport}>
                <Upload size={15} className="mr-1.5" />
                Import {(parsed?.expenses.length ?? 0) + (parsed?.payments.length ?? 0)} items
              </Button>
            </>
          )}
          {step === 'done' && (
            <>
              <Button variant="secondary" onClick={onClose}>Close</Button>
              <Button onClick={() => { onClose(); navigate(`/group/${importedGroupId}`) }}>
                View group
              </Button>
            </>
          )}
          {step === 'error' && (
            <>
              <Button variant="secondary" onClick={() => setStep('upload')}>Try again</Button>
              <Button variant="secondary" onClick={onClose}>Close</Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
