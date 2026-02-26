import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plane, Home, Calendar, Building2, Sparkles } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useCreateGroup } from '@/hooks/useGroups'
import { COMMON_CURRENCIES } from '@/lib/money'
import type { GroupType } from '@/types'
import { clsx } from 'clsx'

const GROUP_TYPES: { type: GroupType; label: string; icon: React.ReactNode; desc: string }[] = [
  { type: 'trip', label: 'Trip', icon: <Plane size={22} />, desc: 'Travel & vacation' },
  { type: 'house', label: 'House', icon: <Home size={22} />, desc: 'Bills & shared housing' },
  { type: 'event', label: 'Event', icon: <Calendar size={22} />, desc: 'Party or one-time event' },
  { type: 'roommates', label: 'Roommates', icon: <Building2 size={22} />, desc: 'Ongoing roommates' },
  { type: 'custom', label: 'Custom', icon: <Sparkles size={22} />, desc: 'Anything else' },
]

export function CreateGroupPage() {
  const navigate = useNavigate()
  const createGroup = useCreateGroup()

  const [name, setName] = useState('')
  const [type, setType] = useState<GroupType>('trip')
  const [currency, setCurrency] = useState('USD')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Group name is required'); return }
    setError('')

    try {
      const group = await createGroup.mutateAsync({ name: name.trim(), type, base_currency: currency })
      navigate(`/group/${group.id}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Layout title="New Group" showBack backTo="/">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <Input
          label="Group name"
          placeholder="e.g. Paris Trip 2024"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          error={error}
        />

        {/* Type */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Group type</label>
          <div className="grid grid-cols-3 gap-2">
            {GROUP_TYPES.map(t => (
              <button
                key={t.type}
                type="button"
                onClick={() => setType(t.type)}
                className={clsx(
                  'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all',
                  type === t.type
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <span className={clsx(
                  'text-xl',
                  type === t.type ? 'text-blue-600' : 'text-gray-500'
                )}>
                  {t.icon}
                </span>
                <span className={clsx(
                  'text-xs font-medium',
                  type === t.type ? 'text-blue-700' : 'text-gray-600'
                )}>
                  {t.label}
                </span>
              </button>
            ))}
          </div>
          {/* Description */}
          <p className="text-xs text-gray-400 mt-2">
            {GROUP_TYPES.find(t => t.type === type)?.desc}
          </p>
        </div>

        {/* Currency */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Base currency</label>
          <div className="grid grid-cols-4 gap-2">
            {COMMON_CURRENCIES.slice(0, 8).map(c => (
              <button
                key={c.code}
                type="button"
                onClick={() => setCurrency(c.code)}
                className={clsx(
                  'flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl border-2 transition-all',
                  currency === c.code
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <span className="text-lg">{c.flag}</span>
                <span className={clsx(
                  'text-[11px] font-semibold',
                  currency === c.code ? 'text-blue-700' : 'text-gray-600'
                )}>
                  {c.code}
                </span>
              </button>
            ))}
          </div>
          {!COMMON_CURRENCIES.slice(0, 8).find(c => c.code === currency) && (
            <p className="text-xs text-blue-600 mt-1">Selected: {currency}</p>
          )}
        </div>

        <Button type="submit" fullWidth size="lg" loading={createGroup.isPending}>
          Create group
        </Button>
      </form>
    </Layout>
  )
}
