import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CategoryGrid } from '@/components/CategoryCard'
import { PersonCardGrid } from '@/components/PersonCard'
import { useGroup, useGroupMembers } from '@/hooks/useGroups'
import { useCategories } from '@/hooks/useCategories'
import { useCreateExpense, useUpdateExpense, useExpenses } from '@/hooks/useExpenses'
import { useCategorize } from '@/hooks/useCategorize'
import { useAuth } from '@/hooks/useAuth'
import { COMMON_CURRENCIES, fromMinorUnits, formatMoney, toMinorUnits } from '@/lib/money'
import { clsx } from 'clsx'
import type { ExpenseFormData, SplitMethod } from '@/types'
import { todayISO, ensureDailyRates, getFxRate } from '@/lib/fx'

const SPLIT_METHODS: { value: SplitMethod; label: string; desc: string }[] = [
  { value: 'equal', label: 'Equal', desc: 'Divide equally' },
  { value: 'custom_amounts', label: 'By amount', desc: 'Set each person\'s share' },
  { value: 'percent', label: 'By %', desc: 'Set percentages' },
]

export function AddExpensePage() {
  const { groupId, expenseId } = useParams<{ groupId: string; expenseId?: string }>()
  const isEdit = !!expenseId
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: group } = useGroup(groupId!)
  const { data: members } = useGroupMembers(groupId!)
  const { data: categories } = useCategories(group?.type)
  const { data: expenses } = useExpenses(groupId!)
  const createExpense = useCreateExpense(groupId!, group?.base_currency ?? 'USD')
  const updateExpense = useUpdateExpense(groupId!, group?.base_currency ?? 'USD')

  const existingExpense = isEdit ? expenses?.find(e => e.id === expenseId) : undefined

  const profiles = (members ?? []).map(m => m.profile!).filter(Boolean)

  // ─── Form State ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState<ExpenseFormData>({
    label: '',
    original_amount: '',
    original_currency: group?.base_currency ?? 'USD',
    category_id: null,
    category_confidence: null,
    notes: '',
    occurred_at: todayISO() + 'T12:00:00',
    payer_ids: user?.id ? [user.id] : [],
    participant_ids: [],
    split_method: 'equal',
    custom_amounts: {},
    custom_percents: {},
  })

  // Initialize participants and currency from group (create mode only)
  useEffect(() => {
    if (members && user && !isEdit) {
      setForm(f => ({
        ...f,
        participant_ids: members.map(m => m.user_id),
        payer_ids: [user.id],
        original_currency: group?.base_currency ?? f.original_currency,
      }))
    }
  }, [members, user, group, isEdit])

  // Pre-fill from existing expense (edit mode)
  useEffect(() => {
    if (!isEdit || !existingExpense) return
    const payers = (existingExpense.participants ?? [])
      .filter(p => p.role === 'payer')
      .map(p => p.user_id)
    const participants = (existingExpense.participants ?? [])
      .filter(p => p.role === 'participant')
      .map(p => p.user_id)
    setForm({
      label: existingExpense.label,
      original_amount: fromMinorUnits(existingExpense.original_amount, existingExpense.original_currency).toString(),
      original_currency: existingExpense.original_currency,
      category_id: existingExpense.category_id,
      category_confidence: existingExpense.category_confidence,
      notes: existingExpense.notes ?? '',
      occurred_at: existingExpense.occurred_at.slice(0, 10) + 'T12:00:00',
      payer_ids: payers,
      participant_ids: participants,
      split_method: 'equal',
      custom_amounts: {},
      custom_percents: {},
    })
    setManualCategory(true)
  }, [isEdit, existingExpense])

  const [showCurrencies, setShowCurrencies] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [manualCategory, setManualCategory] = useState(false)

  // ─── Live FX preview ──────────────────────────────────────────────────────
  const [fxRate, setFxRate] = useState<number | null>(null)
  const [fxLoading, setFxLoading] = useState(false)

  useEffect(() => {
    const groupCurrency = group?.base_currency
    if (!groupCurrency || form.original_currency === groupCurrency) {
      setFxRate(null)
      return
    }

    let cancelled = false
    setFxLoading(true)
    setFxRate(null)

    ;(async () => {
      try {
        // Fetch today's rates using the group's base currency as the base.
        // ILS-based rates include all currencies, so GBP→ILS is an inverse lookup.
        await ensureDailyRates(groupCurrency)
        const rate = await getFxRate(form.original_currency, groupCurrency, todayISO())
        if (!cancelled) setFxRate(rate)
      } catch {
        // silently ignore — UI will just not show the preview
      } finally {
        if (!cancelled) setFxLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [form.original_currency, group?.base_currency])

  // ─── LLM Categorization ─────────────────────────────────────────────────────
  const { result: llmResult, loading: llmLoading } = useCategorize(
    form.label,
    group?.type ?? 'custom'
  )

  // Auto-apply suggestion (if user hasn't manually chosen)
  useEffect(() => {
    if (llmResult && !manualCategory) {
      setForm(f => ({
        ...f,
        category_id: llmResult.category_id,
        category_confidence: llmResult.confidence,
      }))
    }
  }, [llmResult, manualCategory])

  // ─── Handlers ───────────────────────────────────────────────────────────────
  function handleCategorySelect(id: string) {
    setManualCategory(true)
    setForm(f => ({ ...f, category_id: id, category_confidence: 1.0 }))
  }

  function togglePayer(userId: string) {
    setForm(f => ({
      ...f,
      payer_ids: f.payer_ids.includes(userId)
        ? f.payer_ids.filter(id => id !== userId)
        : [...f.payer_ids, userId],
    }))
  }

  function toggleParticipant(userId: string) {
    setForm(f => ({
      ...f,
      participant_ids: f.participant_ids.includes(userId)
        ? f.participant_ids.filter(id => id !== userId)
        : [...f.participant_ids, userId],
    }))
  }

  function handleSplitMethodChange(method: SplitMethod) {
    const total = parseFloat(form.original_amount || '0')
    const n = form.participant_ids.length
    let newAmounts = form.custom_amounts
    let newPercents = form.custom_percents

    if (method === 'custom_amounts' && n > 0) {
      const equal = total / n
      const amounts: Record<string, string> = {}
      form.participant_ids.forEach(id => { amounts[id] = equal.toFixed(2) })
      // Fix last to absorb rounding
      const lastId = form.participant_ids[n - 1]
      const nonLastSum = form.participant_ids.slice(0, -1)
        .reduce((s, id) => s + parseFloat(amounts[id] || '0'), 0)
      amounts[lastId] = Math.max(0, total - nonLastSum).toFixed(2)
      newAmounts = amounts
    }

    if (method === 'percent' && n > 0) {
      const equalPct = 100 / n
      const percents: Record<string, string> = {}
      form.participant_ids.forEach(id => { percents[id] = equalPct.toFixed(1) })
      const lastId = form.participant_ids[n - 1]
      const nonLastSum = form.participant_ids.slice(0, -1)
        .reduce((s, id) => s + parseFloat(percents[id] || '0'), 0)
      percents[lastId] = Math.max(0, 100 - nonLastSum).toFixed(1)
      newPercents = percents
    }

    setForm(f => ({ ...f, split_method: method, custom_amounts: newAmounts, custom_percents: newPercents }))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.label.trim()) e.label = 'Description is required'
    if (!form.original_amount || isNaN(parseFloat(form.original_amount)))
      e.amount = 'Enter a valid amount'
    if (parseFloat(form.original_amount) <= 0)
      e.amount = 'Amount must be greater than 0'
    if (form.payer_ids.length === 0) e.payers = 'Select at least one payer'
    if (form.participant_ids.length === 0) e.participants = 'Select at least one participant'

    if (form.split_method === 'custom_amounts') {
      const total = form.participant_ids.reduce(
        (sum, id) => sum + parseFloat(form.custom_amounts[id] || '0'),
        0
      )
      const inputTotal = parseFloat(form.original_amount || '0')
      if (Math.abs(total - inputTotal) > 0.02)
        e.custom = `Shares must add up to ${inputTotal.toFixed(2)} (currently ${total.toFixed(2)})`
    }

    if (form.split_method === 'percent') {
      const total = form.participant_ids.reduce(
        (sum, id) => sum + parseFloat(form.custom_percents[id] || '0'),
        0
      )
      if (Math.abs(total - 100) > 0.5)
        e.custom = `Percentages must add up to 100% (currently ${total.toFixed(1)}%)`
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    try {
      if (isEdit && expenseId) {
        await updateExpense.mutateAsync({ expenseId, form })
      } else {
        await createExpense.mutateAsync(form)
      }
      navigate(`/group/${groupId}`)
    } catch (err) {
      setErrors({ submit: (err as Error).message })
    }
  }

  const groupCurrencySymbol = group?.base_currency ?? 'USD'

  const isPending = isEdit ? updateExpense.isPending : createExpense.isPending

  return (
    <Layout title={isEdit ? 'Edit Expense' : 'Add Expense'} showBack backTo={`/group/${groupId}`}>
      <form onSubmit={handleSubmit} className="space-y-6 pb-8">

        {/* ① Amount */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
            Amount
          </label>
          <div className="flex items-center gap-3">
            {/* Currency pill */}
            <button
              type="button"
              onClick={() => setShowCurrencies(!showCurrencies)}
              className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm px-3 h-12 rounded-xl transition-colors flex-shrink-0"
            >
              {form.original_currency}
              {showCurrencies ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {/* Amount input */}
            <input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={form.original_amount}
              onChange={e => setForm(f => ({ ...f, original_amount: e.target.value }))}
              className={clsx(
                'flex-1 text-3xl font-bold text-gray-900 bg-transparent border-0 outline-none placeholder:text-gray-300',
                errors.amount && 'text-red-500'
              )}
              step="0.01"
              min="0"
            />
          </div>
          {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}

          {/* Currency selector */}
          {showCurrencies && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="grid grid-cols-4 gap-2">
                {COMMON_CURRENCIES.map(c => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => {
                      setForm(f => ({ ...f, original_currency: c.code }))
                      setShowCurrencies(false)
                    }}
                    className={clsx(
                      'flex flex-col items-center py-2 rounded-xl border-2 transition-all',
                      form.original_currency === c.code
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-100 hover:border-gray-200'
                    )}
                  >
                    <span className="text-base">{c.flag}</span>
                    <span className="text-[10px] font-semibold text-gray-600">{c.code}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* FX live preview */}
          {form.original_currency !== groupCurrencySymbol && (
            <div className="mt-2">
              {fxLoading && (
                <p className="text-xs text-blue-400 animate-pulse">Fetching exchange rate…</p>
              )}
              {!fxLoading && fxRate !== null && (() => {
                const hasAmount = !!form.original_amount && parseFloat(form.original_amount) > 0
                const convertedMinor = hasAmount
                  ? Math.round(toMinorUnits(form.original_amount, form.original_currency) * fxRate)
                  : null
                return (
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    {convertedMinor !== null && (
                      <p className="text-base font-semibold text-blue-600">
                        ≈ {formatMoney(convertedMinor, groupCurrencySymbol)}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">
                      1 {form.original_currency} = {fxRate.toFixed(4)} {groupCurrencySymbol}
                    </p>
                  </div>
                )
              })()}
              {!fxLoading && fxRate === null && (
                <p className="text-xs text-gray-400">
                  Will be converted to {groupCurrencySymbol} at today's rate
                </p>
              )}
            </div>
          )}
        </div>

        {/* ② Label */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
            Description
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="What was this for?"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              className={clsx(
                'w-full text-base text-gray-900 bg-transparent border-0 outline-none placeholder:text-gray-300',
                errors.label && 'text-red-500'
              )}
            />
            {llmLoading && (
              <span className="absolute right-0 top-0 text-xs text-blue-400 flex items-center gap-1">
                <Sparkles size={12} className="animate-pulse" />
                Suggesting…
              </span>
            )}
          </div>
          {errors.label && <p className="text-xs text-red-500 mt-1">{errors.label}</p>}
        </div>

        {/* ③ Category cards */}
        {categories && categories.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Category
              </label>
              {llmResult && !manualCategory && (
                <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles size={10} />
                  AI suggested · {Math.round(llmResult.confidence * 100)}%
                </span>
              )}
            </div>
            <CategoryGrid
              categories={categories}
              selectedId={form.category_id}
              suggestedId={!manualCategory ? llmResult?.category_id : null}
              confidence={llmResult?.confidence}
              onSelect={handleCategorySelect}
            />
          </div>
        )}

        {/* ④ Payers */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-3">
            Paid by
          </label>
          <PersonCardGrid
            profiles={profiles}
            selected={form.payer_ids}
            onToggle={togglePayer}
          />
          {errors.payers && <p className="text-xs text-red-500 mt-2">{errors.payers}</p>}
        </div>

        {/* ⑤ Participants */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-3">
            Split between
          </label>
          <PersonCardGrid
            profiles={profiles}
            selected={form.participant_ids}
            onToggle={toggleParticipant}
          />
          {errors.participants && (
            <p className="text-xs text-red-500 mt-2">{errors.participants}</p>
          )}

          {/* ⑥ Split method */}
          {form.participant_ids.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Split method
              </p>
              <div className="flex gap-2">
                {SPLIT_METHODS.map(m => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => handleSplitMethodChange(m.value)}
                    className={clsx(
                      'flex-1 py-2 text-xs font-medium rounded-xl border-2 transition-all',
                      form.split_method === m.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Equal split breakdown */}
              {form.split_method === 'equal' && form.participant_ids.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {form.participant_ids.map(uid => {
                    const p = profiles.find(pr => pr.id === uid)
                    const total = parseFloat(form.original_amount || '0')
                    const share = form.participant_ids.length > 0 ? total / form.participant_ids.length : 0
                    return (
                      <div key={uid} className="flex items-center justify-between py-0.5">
                        <span className="text-sm text-gray-600">{p?.display_name.split(' ')[0] ?? uid}</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {share > 0 ? `${form.original_currency} ${share.toFixed(2)}` : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Custom amounts */}
              {form.split_method === 'custom_amounts' && (
                <div className="mt-3 space-y-2">
                  {form.participant_ids.map((uid, i) => {
                    const p = profiles.find(pr => pr.id === uid)
                    const isLast = i === form.participant_ids.length - 1
                    return (
                      <div key={uid} className="flex items-center gap-2">
                        <span className="text-sm text-gray-700 flex-1 truncate">
                          {p?.display_name.split(' ')[0] ?? uid}
                        </span>
                        {isLast ? (
                          <div className="w-24 h-9 flex items-center justify-end px-2 bg-gray-50 border border-dashed border-gray-200 rounded-lg text-sm text-gray-500 font-medium">
                            {form.custom_amounts[uid] || '0.00'}
                          </div>
                        ) : (
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={form.custom_amounts[uid] ?? ''}
                            onChange={e => {
                              const newAmounts = { ...form.custom_amounts, [uid]: e.target.value }
                              const total = parseFloat(form.original_amount || '0')
                              const lastId = form.participant_ids[form.participant_ids.length - 1]
                              const nonLastSum = form.participant_ids.slice(0, -1)
                                .reduce((sum, id) => sum + parseFloat(newAmounts[id] || '0'), 0)
                              newAmounts[lastId] = Math.max(0, total - nonLastSum).toFixed(2)
                              setForm(f => ({ ...f, custom_amounts: newAmounts }))
                            }}
                            className="w-24 text-sm text-right border border-gray-200 rounded-lg h-9 px-2 outline-none focus:ring-2 focus:ring-blue-500"
                            step="0.01"
                            min="0"
                            max={(() => {
                              const total = parseFloat(form.original_amount || '0')
                              const othersSum = form.participant_ids
                                .filter((id, idx) => id !== uid && idx !== form.participant_ids.length - 1)
                                .reduce((sum, id) => sum + parseFloat(form.custom_amounts[id] || '0'), 0)
                              return Math.max(0, total - othersSum).toFixed(2)
                            })()}
                          />
                        )}
                      </div>
                    )
                  })}
                  {errors.custom && (
                    <p className="text-xs text-red-500">{errors.custom}</p>
                  )}
                </div>
              )}

              {/* Custom percents */}
              {form.split_method === 'percent' && (
                <div className="mt-3 space-y-2">
                  {form.participant_ids.map((uid, i) => {
                    const p = profiles.find(pr => pr.id === uid)
                    const isLast = i === form.participant_ids.length - 1
                    const pct = parseFloat(form.custom_percents[uid] || '0')
                    const total = parseFloat(form.original_amount || '0')
                    const computed = (pct / 100) * total
                    return (
                      <div key={uid} className="flex items-center gap-2">
                        <span className="text-sm text-gray-700 flex-1 truncate">
                          {p?.display_name.split(' ')[0] ?? uid}
                        </span>
                        <div className="flex items-center gap-1">
                          {isLast ? (
                            <div className="w-16 h-9 flex items-center justify-end px-2 bg-gray-50 border border-dashed border-gray-200 rounded-lg text-sm text-gray-500 font-medium">
                              {form.custom_percents[uid] || '0'}
                            </div>
                          ) : (
                            <input
                              type="number"
                              inputMode="decimal"
                              placeholder="0"
                              value={form.custom_percents[uid] ?? ''}
                              onChange={e => {
                                const newPercents = { ...form.custom_percents, [uid]: e.target.value }
                                const lastId = form.participant_ids[form.participant_ids.length - 1]
                                const nonLastSum = form.participant_ids.slice(0, -1)
                                  .reduce((sum, id) => sum + parseFloat(newPercents[id] || '0'), 0)
                                newPercents[lastId] = Math.max(0, 100 - nonLastSum).toFixed(1)
                                setForm(f => ({ ...f, custom_percents: newPercents }))
                              }}
                              className="w-16 text-sm text-right border border-gray-200 rounded-lg h-9 px-2 outline-none focus:ring-2 focus:ring-blue-500"
                              step="1"
                              min="0"
                              max={(() => {
                                const otherPctSum = form.participant_ids
                                  .filter((id, idx) => id !== uid && idx !== form.participant_ids.length - 1)
                                  .reduce((sum, id) => sum + parseFloat(form.custom_percents[id] || '0'), 0)
                                return Math.max(0, 100 - otherPctSum)
                              })()}
                            />
                          )}
                          <span className="text-sm text-gray-400">%</span>
                          {computed > 0 && (
                            <span className="text-xs text-gray-400 w-16 text-right">
                              {form.original_currency} {computed.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {errors.custom && (
                    <p className="text-xs text-red-500">{errors.custom}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ⑦ Date */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <Input
            label="Date"
            type="date"
            value={form.occurred_at.slice(0, 10)}
            onChange={e =>
              setForm(f => ({ ...f, occurred_at: e.target.value + 'T12:00:00' }))
            }
          />
        </div>

        {/* ⑧ Notes */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
            Notes (optional)
          </label>
          <textarea
            placeholder="Any additional details…"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full text-sm text-gray-900 bg-transparent border-0 outline-none placeholder:text-gray-300 resize-none"
            rows={2}
          />
        </div>

        {/* Submit */}
        {errors.submit && (
          <p className="text-sm text-red-500 bg-red-50 p-3 rounded-xl">{errors.submit}</p>
        )}

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={isPending}
        >
          {isEdit ? 'Update expense' : 'Save expense'}
        </Button>
      </form>
    </Layout>
  )
}
