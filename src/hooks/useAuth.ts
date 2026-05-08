import { useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile as updateFirebaseProfile,
  type User as FirebaseUser,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { firebaseAuth, firestore } from '@/lib/firebase'
import type { Profile } from '@/types'

export function useAuth() {
  const [session, setSession] = useState<{ user: { id: string; email: string | null } } | null>(null)
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (nextUser) => {
      setUser(nextUser ? { id: nextUser.uid, email: nextUser.email } : null)
      setSession(nextUser ? { user: { id: nextUser.uid, email: nextUser.email } } : null)
      if (nextUser) {
        await loadProfile(nextUser)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [])

  async function loadProfile(authUser: FirebaseUser) {
    try {
      const profileRef = doc(firestore, 'profiles', authUser.uid)
      const snapshot = await getDoc(profileRef)

      if (snapshot.exists()) {
        const data = snapshot.data()
        setProfile({
          id: authUser.uid,
          display_name: data.displayName ?? authUser.displayName ?? 'User',
          avatar_url: data.avatarUrl ?? authUser.photoURL ?? null,
          email: data.email ?? authUser.email ?? null,
          is_guest: !!data.isGuest,
          created_at: data.createdAt ?? undefined,
        })
      } else {
        const displayName = authUser.displayName ?? authUser.email?.split('@')[0] ?? 'User'
        const avatarUrl = authUser.photoURL ?? null
        await setDoc(profileRef, {
          displayName,
          avatarUrl,
          email: authUser.email ?? null,
          isGuest: false,
          createdAt: serverTimestamp(),
        }, { merge: true })
        setProfile({ id: authUser.uid, display_name: displayName, avatar_url: avatarUrl, email: authUser.email ?? undefined, is_guest: false })
      }
    } catch (err) {
      console.error('[auth] loadProfile error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function signInWithGoogle() {
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(firebaseAuth, provider)
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  async function signIn(email: string, password: string) {
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password)
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  async function signUp(email: string, password: string) {
    try {
      await createUserWithEmailAndPassword(firebaseAuth, email, password)
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  async function signOut() {
    await firebaseSignOut(firebaseAuth)
  }

  async function updateProfile(updates: Partial<Pick<Profile, 'display_name' | 'avatar_url'>>) {
    if (!user) return
    try {
      const authUser = firebaseAuth.currentUser
      if (!authUser) throw new Error('Not authenticated')

      if (updates.display_name || updates.avatar_url) {
        await updateFirebaseProfile(authUser, {
          displayName: updates.display_name ?? authUser.displayName,
          photoURL: updates.avatar_url ?? authUser.photoURL,
        })
      }

      const profileRef = doc(firestore, 'profiles', user.id)
      await updateDoc(profileRef, {
        ...(updates.display_name !== undefined ? { displayName: updates.display_name } : {}),
        ...(updates.avatar_url !== undefined ? { avatarUrl: updates.avatar_url } : {}),
      })

      setProfile((prev) => prev ? {
        ...prev,
        ...(updates.display_name !== undefined ? { display_name: updates.display_name } : {}),
        ...(updates.avatar_url !== undefined ? { avatar_url: updates.avatar_url } : {}),
      } : prev)

      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  return { session, user, profile, loading, signInWithGoogle, signIn, signUp, signOut, updateProfile }
}
