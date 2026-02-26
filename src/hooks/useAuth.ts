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
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else setLoading(false)
    })

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          await loadProfile(session.user.id)
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (!error && data) {
      setProfile(data as Profile)
    } else if (!data) {
      // Profile not yet created (trigger might be slow), create it
      const user = (await supabase.auth.getUser()).data.user
      if (user) {
        const displayName =
          user.user_metadata?.full_name ??
          user.email?.split('@')[0] ??
          'User'
        await supabase.from('profiles').upsert({
          id: userId,
          display_name: displayName,
          avatar_url: user.user_metadata?.avatar_url ?? null,
        })
        setProfile({ id: userId, display_name: displayName, avatar_url: null })
      }
    }
    setLoading(false)
  }

  async function signInWithMagicLink(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + (import.meta.env.BASE_URL || '/'),
      },
    })
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

  return { session, user, profile, loading, signInWithMagicLink, signOut, updateProfile }
}
