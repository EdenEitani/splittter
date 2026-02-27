import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { UserPlus, Check, Pencil, Trash2, AlertTriangle, Plane, Home, Calendar, Building2, Sparkles } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useGroup, useGroupMembers, useAddMember, useUpdateGroup, useDeleteGroup, useUpdateMemberProfile } from '@/hooks/useGroups'
import { useAuth } from '@/hooks/useAuth'
import { COMMON_CURRENCIES } from '@/lib/money'
import { clsx } from 'clsx'
import type { GroupType } from '@/types'

const GROUP_TYPES: { type: GroupType; label: string; icon: React.ReactNode; desc: string }[] = [
  { type: 'trip',      label: 'Trip',      icon: <Plane size={18} />,     desc: 'Travel & vacation' },
  { type: 'house',     label: 'House',     icon: <Home size={18} />,      desc: 'Bills & shared housing' },
  { type: 'event',     label: 'Event',     icon: <Calendar size={18} />,  desc: 'Party or one-time event' },
  { type: 'roommates', label: 'Roommates', icon: <Building2 size={18} />, desc: 'Ongoing roommates' },
  { type: 'custom',    label: 'Custom',    icon: <Sparkles size={18} />,  desc: 'Anything else' },
]

const SUGGESTED_EMOJIS = ['🏠','✈️','🎉','🍕','🏋️','🌴','🎸','🎮','🛒','🎓','💼','🏊','🚗','🐶','🎯','🌍']

export function GroupSettingsPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: group } = useGroup(groupId!)
  const { data: members } = useGroupMembers(groupId!)
  const addMember = useAddMember()
  const updateGroup = useUpdateGroup()
  const deleteGroup = useDeleteGroup()
  const updateMemberProfile = useUpdateMemberProfile()

  // Add member form
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [memberError, setMemberError] = useState('')

  // Member inline editing
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [memberNameInput, setMemberNameInput] = useState('')
  const [memberEmailInput, setMemberEmailInput] = useState('')
  const [memberEditMsg, setMemberEditMsg] = useState('')

  // Group name edit
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [nameMsg, setNameMsg] = useState('')

  // Emoji edit
  const [editingEmoji, setEditingEmoji] = useState(false)
  const [emojiInput, setEmojiInput] = useState('')
  const [emojiMsg, setEmojiMsg] = useState('')

  // Currency edit
  const [editingCurrency, setEditingCurrency] = useState(false)
  const [selectedCurrency, setSelectedCurrency] = useState('')
  const [currencyMsg, setCurrencyMsg] = useState('')

  // Type edit
  const [editingType, setEditingType] = useState(false)
  const [selectedType, setSelectedType] = useState<GroupType>('custom')
  const [typeMsg, setTypeMsg] = useState('')

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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

  async function handleSaveMember(userId: string) {
    setMemberEditMsg('')
    try {
      await updateMemberProfile.mutateAsync({
        userId,
        groupId: groupId!,
        display_name: memberNameInput.trim() || undefined,
        email: memberEmailInput,
      })
      setEditingMemberId(null)
    } catch (err) {
      setMemberEditMsg((err as Error).message)
    }
  }

  function startEditMember(userId: string, currentName: string, currentEmail: string) {
    setEditingMemberId(userId)
    setMemberNameInput(currentName)
    setMemberEmailInput(currentEmail)
    setMemberEditMsg('')
  }

  async function handleSaveName() {
    if (!nameInput.trim() || nameInput.trim() === group?.name) {
      setEditingName(false)
      return
    }
    try {
      await updateGroup.mutateAsync({ groupId: groupId!, name: nameInput.trim() })
      setNameMsg('Group name updated.')
      setEditingName(false)
    } catch (err) {
      setNameMsg((err as Error).message)
    }
  }

  function startEditName() {
    setNameInput(group?.name ?? '')
    setEditingName(true)
    setNameMsg('')
  }

  async function handleSaveEmoji() {
    try {
      await updateGroup.mutateAsync({ groupId: groupId!, emoji: emojiInput.trim() || null })
      setEmojiMsg('Icon updated.')
      setEditingEmoji(false)
    } catch (err) {
      setEmojiMsg((err as Error).message)
    }
  }

  function startEditEmoji() {
    setEmojiInput(group?.emoji ?? '')
    setEditingEmoji(true)
    setEmojiMsg('')
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

  async function handleSaveType() {
    if (!selectedType || selectedType === group?.type) {
      setEditingType(false)
      return
    }
    try {
      await updateGroup.mutateAsync({ groupId: groupId!, type: selectedType })
      setTypeMsg(`Group type updated to ${selectedType}`)
      setEditingType(false)
    } catch (err) {
      setTypeMsg((err as Error).message)
    }
  }

  function startEditType() {
    setSelectedType((group?.type ?? 'custom') as GroupType)
    setEditingType(true)
    setTypeMsg('')
  }

  async function handleDelete() {
    try {
      await deleteGroup.mutateAsync(groupId!)
      navigate('/')
    } catch (err) {
      alert((err as Error).message)
    }
  }

  return (
    <Layout
      title={`${group?.name ?? 'Group'} – Settings`}
      showBack
      backTo={`/group/${groupId}`}
    >
      <div className="space-y-4">

        {/* Group info */}
        {group && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Group Info</h2>
            </div>
            <div className="p-4 space-y-3">

              {/* Name row */}
              {!editingName ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Name</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{group.name}</p>
                  </div>
                  <button onClick={startEditName} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                    <Pencil size={12} /> Edit
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    label="Group name"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    autoFocus
                  />
                  {nameMsg && <p className="text-xs text-green-600">{nameMsg}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" loading={updateGroup.isPending} onClick={handleSaveName}>
                      <Check size={14} className="mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingName(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <div className="border-t border-gray-50" />

              {/* Emoji row */}
              {!editingEmoji ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Icon (emoji)</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">
                      {group.emoji ? (
                        <span className="text-xl">{group.emoji}</span>
                      ) : (
                        <span className="text-gray-400">None (uses type icon)</span>
                      )}
                    </p>
                  </div>
                  <button onClick={startEditEmoji} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                    <Pencil size={12} /> {group.emoji ? 'Edit' : 'Add'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Choose an emoji</p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_EMOJIS.map(e => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setEmojiInput(e)}
                        className={clsx(
                          'w-10 h-10 text-xl rounded-xl border-2 transition-all flex items-center justify-center',
                          emojiInput === e
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        )}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                  <Input
                    placeholder="Or type any emoji…"
                    value={emojiInput}
                    onChange={e => setEmojiInput(e.target.value)}
                  />
                  {emojiMsg && <p className="text-xs text-green-600">{emojiMsg}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" loading={updateGroup.isPending} onClick={handleSaveEmoji}>
                      <Check size={14} className="mr-1" /> Save
                    </Button>
                    {group.emoji && (
                      <Button size="sm" variant="secondary" onClick={async () => {
                        await updateGroup.mutateAsync({ groupId: groupId!, emoji: null })
                        setEditingEmoji(false)
                      }}>
                        Remove
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => setEditingEmoji(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <div className="border-t border-gray-50" />

              {/* Type row */}
              {!editingType ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Type</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5 capitalize">{group.type}</p>
                  </div>
                  <button onClick={startEditType} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                    <Pencil size={12} /> Edit
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select type</p>
                  <div className="grid grid-cols-3 gap-2">
                    {GROUP_TYPES.map(t => (
                      <button
                        key={t.type}
                        type="button"
                        onClick={() => setSelectedType(t.type)}
                        className={clsx(
                          'flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border-2 transition-all',
                          selectedType === t.type
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        )}
                      >
                        <span className={clsx(selectedType === t.type ? 'text-blue-600' : 'text-gray-500')}>
                          {t.icon}
                        </span>
                        <span className={clsx('text-[11px] font-semibold', selectedType === t.type ? 'text-blue-700' : 'text-gray-600')}>
                          {t.label}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">{GROUP_TYPES.find(t => t.type === selectedType)?.desc}</p>
                  {typeMsg && <p className="text-xs text-green-600">{typeMsg}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" loading={updateGroup.isPending} onClick={handleSaveType}>
                      <Check size={14} className="mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingType(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <div className="border-t border-gray-50" />

              {/* Currency row */}
              {!editingCurrency ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Base currency</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{group.base_currency}</p>
                  </div>
                  <button onClick={startEditCurrency} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                    <Pencil size={12} /> Edit
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select currency</p>
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
                        <span className={clsx('text-[11px] font-semibold', selectedCurrency === c.code ? 'text-blue-700' : 'text-gray-600')}>
                          {c.code}
                        </span>
                      </button>
                    ))}
                  </div>
                  {currencyMsg && <p className="text-xs text-green-600">{currencyMsg}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" loading={updateGroup.isPending} onClick={handleSaveCurrency}>
                      <Check size={14} className="mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingCurrency(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Members list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Members</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {(members ?? []).map(m => (
              <div key={m.user_id} className="px-4 py-3">
                {editingMemberId === m.user_id ? (
                  <div className="space-y-2">
                    <Input
                      label="Name"
                      value={memberNameInput}
                      onChange={e => setMemberNameInput(e.target.value)}
                      autoFocus
                    />
                    <Input
                      type="email"
                      label="Email (optional)"
                      value={memberEmailInput}
                      onChange={e => setMemberEmailInput(e.target.value)}
                      inputMode="email"
                      autoComplete="email"
                    />
                    {memberEditMsg && <p className="text-xs text-red-500">{memberEditMsg}</p>}
                    <div className="flex gap-2">
                      <Button size="sm" loading={updateMemberProfile.isPending} onClick={() => handleSaveMember(m.user_id)}>
                        <Check size={14} className="mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditingMemberId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                      {m.profile?.display_name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {m.profile?.display_name}
                        {m.user_id === user?.id && (
                          <span className="text-gray-400 font-normal"> (you)</span>
                        )}
                        {m.profile?.is_guest && (
                          <span className="text-gray-400 font-normal text-xs"> · guest</span>
                        )}
                      </p>
                      {m.profile?.email ? (
                        <p className="text-xs text-gray-500 mt-0.5">{m.profile.email}</p>
                      ) : (
                        <p className="text-xs text-gray-400 capitalize">{m.role}</p>
                      )}
                    </div>
                    {m.profile?.is_guest && m.user_id !== user?.id && (
                      <button
                        onClick={() => startEditMember(m.user_id, m.profile?.display_name ?? '', m.profile?.email ?? '')}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium flex-shrink-0"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                    )}
                  </div>
                )}
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

        {/* Danger zone */}
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-red-50">
            <h2 className="text-sm font-semibold text-red-600">Danger Zone</h2>
          </div>
          <div className="p-4">
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 text-sm font-medium text-red-500 hover:text-red-600 transition-colors"
              >
                <Trash2 size={16} />
                Delete this group
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2 bg-red-50 rounded-xl p-3">
                  <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-700">
                    This will permanently delete the group, all expenses, and all payment history. This cannot be undone.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    loading={deleteGroup.isPending}
                    onClick={handleDelete}
                  >
                    <Trash2 size={15} className="mr-1.5" />
                    Yes, delete group
                  </Button>
                  <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
