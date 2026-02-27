import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function AuthPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    setError('')

    const { error } = mode === 'signin'
      ? await signIn(email.trim().toLowerCase(), password)
      : await signUp(email.trim().toLowerCase(), password)

    if (error) setError(error.message)
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {mode === 'signin' ? 'Welcome back!' : 'Get started for free.'}
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
            />

            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              error={error}
            />

            <Button
              type="submit"
              fullWidth
              size="lg"
              loading={loading}
              disabled={!email.trim() || !password}
            >
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError('') }}
              className="text-blue-600 font-medium hover:underline"
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
