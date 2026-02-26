import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PersonCard } from '@/components/PersonCard'
import { useGroup, useGroupMembers } from '@/hooks/useGroups'
import { useCreatePayment } from '@/hooks/usePayments'
import { useAuth } from '@/hooks/useAuth'
import { COMMON_CURRENCIES } from '@/lib/money'
import { todayISO } from '@/lib/fx'
import { clsx } from 'clsx'
import type { PaymentFormData } from '@/types'

export function AddPaymentPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: group } = useGroup(groupId!)
  const { data: members } = useGroupMembers(groupId!)
  const createPayment = useCreatePayment(groupId!, group?.base_currency ?? 'USD')

  const profiles = (members ?? []).map(m => m.profile!).filter(Boolean)

  const [form, setForm] = useState<PaymentFormData>({
    from_user_id: searchParams.get('from') ?? user?.id ?? '',
    to_user_id: searchParams.get('to') ?? '',
    original_amount: '',
    original_currency: group?.base_currency ?? 'USD',
    notes: '',
    occurred_at: todayISO() + 'T12:00:00',
  })

  useEffect(() => {
    if (group) {
      setForm(f => ({ ...f, original_currency: group.base_currency }))
    }
    if (user && !form.from_user_id) {
      setForm(f => ({ ...f, from_user_id: user.id }))
    }
  }, [group, user])

  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.from_user_id) e.from = 'Select who is paying'
    if (!form.to_user_id) e.to = 'Select who receives payment'
    if (form.from_user_id === form.to_user_id) e.to = 'From and To must be different people'
    if (!form.original_amount || parseFloat(form.original_amount) <= 0)
      e.amount = 'Enter a valid amount'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    try {
      await createPayment.mutateAsync(form)
      navigate(`/group/${groupId}`)
    } catch (err) {
      setErrors({ submit: (err as Error).message })
    }
  }

  return (
    <Layout title="Settle Up" showBack backTo={`/group/${groupId}`}>
      <form onSubmit={handleSubmit} className="space-y-6 pb-8">

        {/* From → To */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-4">
            Settlement direction
          </label>
          <div className="flex items-center gap-3">
            {/* From */}
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-2">From (paying)</p>
              <div className="flex flex-wrap gap-2">
                {profiles.map(p => (
                  <PersonCard
                    key={p.id}
                    profile={p}
                    selected={form.from_user_id === p.id}
                    onToggle={id => setForm(f => ({ ...f, from_user_id: id }))}
                    size="sm"
                  />
                ))}
              </div>
              {errors.from && <p className="text-xs text-red-500 mt-1">{errors.from}</p>}
            </div>

            {/* Arrow */}
            <div className="flex-shrink-0 mt-4">
              <ArrowRight size={20} className="text-gray-300" />
            </div>

            {/* To */}
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-2">To (receiving)</p>
              <div className="flex flex-wrap gap-2">
                {profiles
                  .filter(p => p.id !== form.from_user_id)
                  .map(p => (
                    <PersonCard
                      key={p.id}
                      profile={p}
                      selected={form.to_user_id === p.id}
                      onToggle={id => setForm(f => ({ ...f, to_user_id: id }))}
                      size="sm"
                    />
                  ))}
              </div>
              {errors.to && <p className="text-xs text-red-500 mt-1">{errors.to}</p>}
            </div>
          </div>
        </div>

        {/* Amount */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
            Amount
          </label>
          <div className="flex items-center gap-3">
            {/* Currency selector */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {COMMON_CURRENCIES.slice(0, 6).map(c => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, original_currency: c.code }))}
                  className={clsx(
                    'text-xs font-semibold px-2.5 h-7 rounded-full border-2 transition-all',
                    form.original_currency === c.code
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  )}
                >
                  {c.code}
                </button>
              ))}
            </div>
          </div>
          <input
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={form.original_amount}
            onChange={e => setForm(f => ({ ...f, original_amount: e.target.value }))}
            className="w-full text-3xl font-bold text-gray-900 bg-transparent border-0 outline-none placeholder:text-gray-300"
            step="0.01"
            min="0"
          />
          {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}
        </div>

        {/* Date */}
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

        {/* Notes */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
            Notes (optional)
          </label>
          <textarea
            placeholder="e.g. Venmo payment for April rent"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full text-sm text-gray-900 bg-transparent border-0 outline-none placeholder:text-gray-300 resize-none"
            rows={2}
          />
        </div>

        {errors.submit && (
          <p className="text-sm text-red-500 bg-red-50 p-3 rounded-xl">{errors.submit}</p>
        )}

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={createPayment.isPending}
        >
          Record payment
        </Button>
      </form>
    </Layout>
  )
}
