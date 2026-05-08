import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { httpsCallable } from 'firebase/functions'
import { firebaseFunctions } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import { groupKeys } from '@/hooks/useGroups'

export function JoinGroupPage() {
  const { groupId, token } = useParams<{ groupId: string; token: string }>()
  const navigate = useNavigate()
  const { session, loading: authLoading } = useAuth()
  const qc = useQueryClient()
  const hasJoined = useRef(false)
  const [state, setState] = useState<'loading' | 'joining' | 'success' | 'error' | 'needs_auth'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (authLoading) return

    if (!session) {
      setState('needs_auth')
      return
    }

    if (hasJoined.current) return
    hasJoined.current = true
    setState('joining')

    const joinGroup = httpsCallable(firebaseFunctions, 'joinGroupWithInvite')
    joinGroup({ groupId, token })
      .then(() => {
        qc.invalidateQueries({ queryKey: groupKeys.all })
        setState('success')
        navigate(`/group/${groupId}`, { replace: true })
      })
      .catch((error) => {
          setState('error')
          setErrorMsg(error.message ?? 'Failed to join group')
      })
  }, [authLoading, groupId, navigate, qc, session, token])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center space-y-4">
        {(state === 'loading' || state === 'joining') && (
          <>
            <div className="text-3xl animate-bounce">🤝</div>
            <p className="text-sm font-medium text-gray-700">Joining group…</p>
          </>
        )}

        {state === 'needs_auth' && (
          <>
            <div className="text-3xl">🔐</div>
            <h1 className="text-base font-semibold text-gray-900">Sign in to join</h1>
            <p className="text-sm text-gray-500">
              You need to be signed in to accept this group invite.
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="w-full bg-blue-600 text-white text-sm font-semibold h-11 rounded-xl hover:bg-blue-700 transition-colors"
            >
              Sign in
            </button>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="text-3xl">✅</div>
            <p className="text-sm font-medium text-gray-700">Joined! Redirecting…</p>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="text-3xl">❌</div>
            <h1 className="text-base font-semibold text-gray-900">Invalid invite link</h1>
            <p className="text-sm text-gray-500">{errorMsg}</p>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-gray-100 text-gray-700 text-sm font-medium h-10 rounded-xl hover:bg-gray-200 transition-colors"
            >
              Go to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  )
}
