import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'

initializeApp()
const db = getFirestore()

export const joinGroupWithInvite = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const groupId = String(request.data?.groupId || '')
  const token = String(request.data?.token || '')
  if (!groupId || !token) {
    throw new HttpsError('invalid-argument', 'groupId and token are required')
  }

  const groupRef = db.collection('groups').doc(groupId)
  const groupSnap = await groupRef.get()
  if (!groupSnap.exists) {
    throw new HttpsError('not-found', 'Group not found')
  }

  const group = groupSnap.data()
  if (!group || group.inviteToken !== token) {
    throw new HttpsError('permission-denied', 'Invalid invite link')
  }

  const memberRef = groupRef.collection('members').doc(uid)
  const memberSnap = await memberRef.get()
  if (!memberSnap.exists) {
    await memberRef.set({
      userId: uid,
      role: 'member',
      joinedAt: new Date().toISOString(),
    })
  }

  return { ok: true }
})
