import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { UserPlus, Check } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useGroup, useGroupMembers, useAddMember, useUpdateGroup } from '@/hooks/useGroups'
import { useAuth } from '@/hooks/useAuth'
import { COMMON_CURRENCIES } from '@/lib/money'
import { clsx } from 'clsx'

export function GroupSettingsPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const { user } = useAuth()
  const { data: group } = useGroup(groupId!)
  const { data: members } = useGroupMembers(groupId!)
  const addMember = useAddMember()
  const updateGroup = useUpdateGroup()

  // Add member form
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [memberError, setMemberError] = useState('')

  // Currency edit
  const [editingCurrency, setEditingCurrency] = useState(false)
  const [selectedCurrency, setSelectedCurrency] = useState('')
  const [currencyMsg, setCurrencyMsg] = useState('')

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setMemberError('')
    setMsg('')

    try {
      await addMember.mutateAsync({ groupId: groupId!, name: name.trim(), email: email.trim() || undefined })
      setMsg(`${name.trim()} added!`)
      setName('')
      setEmail('')
    } catch (err) {
      setMemberError((err as Error).message)
    }
  }

  async function handleSaveCurrency() {
    if (!selectedCurrency || selectedCurrency === group?.base_currency) {
      setEditingCurrency(false)
      return
    }
    try {
      await updateGroup.mutateAsync({ groupId: groupId!, base_currency: selectedCurrency })
      setCurrencyMsg(`Base currency updated to ${selectedCurrency}`)
      setEditingCurrency(false)
    } catch (err) {
      setCurrencyMsg((err as Error).message)
    }
  }

  function startEditCurrency() {
    setSelectedCurrency(group?.base_currency ?? 'USD')
    setEditingCurrency(true)
    setCurrencyMsg('')
  }

  return (
    <Layout
      title={`${group?.name ?? 'Group'} – Settings`}
      showBack
      backTo={`/group/${groupId}`}
    >
      <div className="space-y-4">

        {/* Members list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Members</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {(members ?? []).map(m => (
              <div key={m.user_id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm">
                  {m.profile?.display_name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {m.profile?.display_name}
                    {m.user_id === user?.id && (
                      <span className="text-gray-400 font-normal"> (you)</span>
                    )}
                    {m.profile?.is_guest && (
                      <span className="text-gray-400 font-normal text-xs"> · guest</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 capitalize">{m.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add member */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Add member</h2>
          <form onSubmit={handleAddMember} className="space-y-3">
            <Input
              placeholder="Name"
              value={name}
              onChange={e => setName(e.target.value)}
              error={memberError}
            />
            <Input
              type="email"
              placeholder="Email (optional)"
              value={email}
              onChange={e => setEmail(e.target.value)}
              inputMode="email"
              autoComplete="email"
            />
            {msg && <p className="text-xs text-green-600">{msg}</p>}
            <Button
              type="submit"
              variant="secondary"
              loading={addMember.isPending}
              disabled={!name.trim()}
            >
              <UserPlus size={15} className="mr-1.5" />
              Add member
            </Button>
          </form>
        </div>

        {/* Group info + currency edit */}
        {group && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Group info</h2>
            <div className="space-y-2 text-sm text-gray-500">
              <p>Type: <span className="capitalize font-medium text-gray-700">{group.type}</span></p>

              {/* Base currency row */}
              {!editingCurrency ? (
                <div className="flex items-center justify-between">
                  <p>Base currency: <span className="font-medium text-gray-700">{group.base_currency}</span></p>
                  <button
                    onClick={startEditCurrency}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <div className="mt-2 space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Base currency</p>
                  <div className="grid grid-cols-4 gap-2">
                    {COMMON_CURRENCIES.slice(0, 8).map(c => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => setSelectedCurrency(c.code)}
                        className={clsx(
                          'flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl border-2 transition-all',
                          selectedCurrency === c.code
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        )}
                      >
                        <span className="text-lg">{c.flag}</span>
                        <span className={clsx(
                          'text-[11px] font-semibold',
                          selectedCurrency === c.code ? 'text-blue-700' : 'text-gray-600'
                        )}>
                          {c.code}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      loading={updateGroup.isPending}
                      onClick={handleSaveCurrency}
                    >
                      <Check size={14} className="mr-1" />
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditingCurrency(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                  {currencyMsg && <p className="text-xs text-green-600">{currencyMsg}</p>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
