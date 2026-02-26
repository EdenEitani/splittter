import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function AuthPage() {
  const { signInWithMagicLink } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')

    const { error } = await signInWithMagicLink(email.trim().toLowerCase())
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚡</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Splittter</h1>
          <p className="text-blue-200 mt-1.5 text-sm">
            Split expenses at the speed of thought
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl p-6 shadow-xl">
          {sent ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">📬</div>
              <h2 className="text-lg font-semibold text-gray-900">Check your inbox</h2>
              <p className="text-sm text-gray-500 mt-2">
                We sent a magic link to{' '}
                <span className="font-medium text-gray-800">{email}</span>
              </p>
              <button
                onClick={() => setSent(false)}
                className="text-sm text-blue-600 mt-4 hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Sign in</h2>
                <p className="text-sm text-gray-500 mt-1">
                  We'll email you a magic link — no password needed.
                </p>
              </div>

              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                required
                inputMode="email"
                autoComplete="email"
                error={error}
              />

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={loading}
                disabled={!email.trim()}
              >
                Send magic link
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-blue-200 text-xs mt-6">
          No account needed — sign in creates your account automatically.
        </p>
      </div>
    </div>
  )
}
