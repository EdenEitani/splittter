import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useGroup, useGroupMembers, useAddMember } from '@/hooks/useGroups'
import { useAuth } from '@/hooks/useAuth'

export function GroupSettingsPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const { user } = useAuth()
  const { data: group } = useGroup(groupId!)
  const { data: members } = useGroupMembers(groupId!)
  const addMember = useAddMember()

  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setError('')
    setMsg('')

    try {
      await addMember.mutateAsync({ groupId: groupId!, email: email.trim().toLowerCase() })
      setMsg(`${email} added successfully!`)
      setEmail('')
    } catch (err) {
      setError((err as Error).message)
    }
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
              type="email"
              placeholder="friend@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              error={error}
              hint="They must have an account first"
            />
            {msg && <p className="text-xs text-green-600">{msg}</p>}
            <Button
              type="submit"
              variant="secondary"
              loading={addMember.isPending}
              disabled={!email.trim()}
            >
              <UserPlus size={15} className="mr-1.5" />
              Add member
            </Button>
          </form>
        </div>

        {/* Group info */}
        {group && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Group info</h2>
            <div className="space-y-1 text-sm text-gray-500">
              <p>Type: <span className="capitalize font-medium text-gray-700">{group.type}</span></p>
              <p>Base currency: <span className="font-medium text-gray-700">{group.base_currency}</span></p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
