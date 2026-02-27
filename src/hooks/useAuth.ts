import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // onAuthStateChange fires immediately with INITIAL_SESSION —
    // use it as the single source of truth (Supabase v2 recommended pattern).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          loadProfile(session.user.id)
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (data) {
        setProfile(data as Profile)
      } else {
        // Profile not yet created (trigger might be slow), create it
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (authUser) {
          const displayName =
            authUser.user_metadata?.full_name ??
            authUser.email?.split('@')[0] ??
            'User'
          await supabase.from('profiles').upsert({
            id: userId,
            display_name: displayName,
            avatar_url: authUser.user_metadata?.avatar_url ?? null,
            is_guest: false,
          })
          setProfile({ id: userId, display_name: displayName, avatar_url: null })
        }
      }
    } catch (err) {
      console.error('[auth] loadProfile error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL ?? '/'}`,
      },
    })
    return { error }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function updateProfile(updates: Partial<Pick<Profile, 'display_name' | 'avatar_url'>>) {
    if (!user) return
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()
    if (!error && data) setProfile(data as Profile)
    return { error }
  }

  return { session, user, profile, loading, signInWithGoogle, signIn, signUp, signOut, updateProfile }
}
