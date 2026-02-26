import { useState } from 'react'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { refreshDailyRates } from '@/lib/fx'
import { LogOut, RefreshCw } from 'lucide-react'

export function SettingsPage() {
  const { profile, signOut, updateProfile } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!displayName.trim()) return
    setSaving(true)
    await updateProfile({ display_name: displayName.trim() })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleRefreshRates() {
    setRefreshing(true)
    setRefreshMsg('')
    try {
      await refreshDailyRates('USD')
      setRefreshMsg('FX rates refreshed successfully!')
    } catch (err) {
      setRefreshMsg(`Failed: ${(err as Error).message}`)
    }
    setRefreshing(false)
  }

  return (
    <Layout title="Settings">
      <div className="space-y-4">

        {/* Profile */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Profile</h2>
          <form onSubmit={handleSaveProfile} className="space-y-3">
            <Input
              label="Display name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
            <Button
              type="submit"
              variant="secondary"
              loading={saving}
              disabled={!displayName.trim()}
            >
              {saved ? '✓ Saved' : 'Save changes'}
            </Button>
          </form>
        </div>

        {/* FX Rates */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Exchange Rates</h2>
          <p className="text-xs text-gray-400 mb-3">
            Manually refresh today's FX rates if auto-refresh hasn't run yet.
          </p>
          <Button
            variant="secondary"
            onClick={handleRefreshRates}
            loading={refreshing}
          >
            <RefreshCw size={15} className="mr-1.5" />
            Refresh rates
          </Button>
          {refreshMsg && (
            <p className={`text-xs mt-2 ${refreshMsg.startsWith('Failed') ? 'text-red-500' : 'text-green-600'}`}>
              {refreshMsg}
            </p>
          )}
        </div>

        {/* Account */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Account</h2>
          <p className="text-sm text-gray-500 mb-3">
            Signed in as <span className="font-medium">{profile?.display_name}</span>
          </p>
          <Button
            variant="danger"
            onClick={signOut}
          >
            <LogOut size={15} className="mr-1.5" />
            Sign out
          </Button>
        </div>

        {/* About */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">About</h2>
          <p className="text-xs text-gray-400">
            Splittter — Fast expense splitting<br />
            Built with Supabase + React + TailwindCSS
          </p>
        </div>
      </div>
    </Layout>
  )
}
