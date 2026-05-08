import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { asIsoDate, asIsoTimestamp, parseJsonField, readJson, requireEnv } from './_migration-utils.mjs'

const SERVICE_ACCOUNT_PATH = requireEnv('FIREBASE_SERVICE_ACCOUNT_PATH')
const PROJECT_ID = requireEnv('FIREBASE_PROJECT_ID')
const IN_FILE = process.env.MIGRATION_IN_FILE || 'migration/supabase-export.json'

const serviceAccount = readJson(SERVICE_ACCOUNT_PATH)

initializeApp({
  credential: cert(serviceAccount),
  projectId: PROJECT_ID,
})

const db = getFirestore()

function mapProfile(p) {
  return {
    displayName: p.display_name,
    email: p.email ?? null,
    avatarUrl: p.avatar_url ?? null,
    isGuest: !!p.is_guest,
    createdAt: asIsoTimestamp(p.created_at),
  }
}

function mapGroup(g) {
  return {
    name: g.name,
    type: g.type,
    baseCurrency: g.base_currency,
    createdBy: g.created_by,
    createdAt: asIsoTimestamp(g.created_at),
    emoji: g.emoji ?? null,
    inboundEmailToken: g.inbound_email_token ?? null,
    billDefaultPayerId: g.bill_default_payer_id ?? null,
    excludeFromTotals: !!g.exclude_from_totals,
    inviteToken: g.invite_token ?? null,
    archived: !!g.archived,
  }
}

function mapCategory(c) {
  return {
    groupType: c.group_type,
    name: c.name,
    icon: c.icon,
    sortOrder: c.sort_order,
    colorToken: c.color_token,
  }
}

function mapFxRate(row) {
  return {
    baseCurrency: row.base_currency,
    date: asIsoDate(row.date),
    rates: parseJsonField(row.rates_json, {}),
    provider: row.provider,
    createdAt: asIsoTimestamp(row.created_at),
  }
}

function mapExpense(e) {
  return {
    groupId: e.group_id,
    createdBy: e.created_by,
    label: e.label,
    notes: e.notes ?? null,
    originalAmount: Number(e.original_amount),
    originalCurrency: e.original_currency,
    groupAmount: Number(e.group_amount),
    groupCurrency: e.group_currency,
    fxRate: Number(e.fx_rate),
    fxDate: asIsoDate(e.fx_date),
    categoryId: e.category_id ?? null,
    categoryConfidence: e.category_confidence == null ? null : Number(e.category_confidence),
    occurredAt: asIsoTimestamp(e.occurred_at),
    createdAt: asIsoTimestamp(e.created_at),
  }
}

function mapExpenseParticipant(p) {
  return {
    userId: p.user_id,
    role: p.role,
    weight: Number(p.weight),
    shareAmountGroupCurrency: p.share_amount_group_currency == null ? null : Number(p.share_amount_group_currency),
  }
}

function mapPayment(p) {
  return {
    groupId: p.group_id,
    createdBy: p.created_by,
    fromUserId: p.from_user_id,
    toUserId: p.to_user_id,
    originalAmount: Number(p.original_amount),
    originalCurrency: p.original_currency,
    groupAmount: Number(p.group_amount),
    groupCurrency: p.group_currency,
    fxRate: Number(p.fx_rate),
    fxDate: asIsoDate(p.fx_date),
    occurredAt: asIsoTimestamp(p.occurred_at),
    createdAt: asIsoTimestamp(p.created_at),
    notes: p.notes ?? null,
  }
}

function mapRecurring(r) {
  return {
    groupId: r.group_id,
    createdBy: r.created_by,
    label: r.label,
    notes: r.notes ?? null,
    originalAmount: Number(r.original_amount),
    originalCurrency: r.original_currency,
    categoryId: r.category_id ?? null,
    payerIds: parseJsonField(r.payer_ids, []),
    participantIds: parseJsonField(r.participant_ids, []),
    splitMethod: r.split_method,
    customAmounts: parseJsonField(r.custom_amounts, null),
    customPercents: parseJsonField(r.custom_percents, null),
    frequency: r.frequency,
    nextDueDate: asIsoDate(r.next_due_date),
    active: !!r.active,
    createdAt: asIsoTimestamp(r.created_at),
  }
}

async function writeBatch(docs) {
  const chunks = []
  for (let i = 0; i < docs.length; i += 400) chunks.push(docs.slice(i, i + 400))

  for (const chunk of chunks) {
    const batch = db.batch()
    for (const { ref, data } of chunk) {
      batch.set(ref, data, { merge: true })
    }
    await batch.commit()
  }
}

async function run() {
  const payload = readJson(IN_FILE)

  const profileDocs = (payload.profiles ?? []).map(p => ({
    ref: db.collection('profiles').doc(p.id),
    data: mapProfile(p),
  }))

  const groupDocs = (payload.groups ?? []).map(g => ({
    ref: db.collection('groups').doc(g.id),
    data: mapGroup(g),
  }))

  const groupMemberDocs = (payload.group_members ?? []).map(gm => ({
    ref: db.collection('groups').doc(gm.group_id).collection('members').doc(gm.user_id),
    data: { userId: gm.user_id, role: gm.role, joinedAt: asIsoTimestamp(gm.joined_at) },
  }))

  const categoryDocs = (payload.categories ?? []).map(c => ({
    ref: db.collection('categories').doc(c.id),
    data: mapCategory(c),
  }))

  const fxDocs = (payload.fx_rates ?? []).map(row => ({
    ref: db.collection('fx_rates').doc(row.id),
    data: mapFxRate(row),
  }))

  const expenseDocs = (payload.expenses ?? []).map(e => ({
    ref: db.collection('expenses').doc(e.id),
    data: mapExpense(e),
  }))

  const participantDocs = (payload.expense_participants ?? []).map(p => ({
    ref: db.collection('expenses').doc(p.expense_id).collection('participants').doc(`${p.user_id}_${p.role}`),
    data: mapExpenseParticipant(p),
  }))

  const paymentDocs = (payload.payments ?? []).map(p => ({
    ref: db.collection('payments').doc(p.id),
    data: mapPayment(p),
  }))

  const recurringDocs = (payload.recurring_expenses ?? []).map(r => ({
    ref: db.collection('recurring_expenses').doc(r.id),
    data: mapRecurring(r),
  }))

  await writeBatch(profileDocs)
  await writeBatch(groupDocs)
  await writeBatch(groupMemberDocs)
  await writeBatch(categoryDocs)
  await writeBatch(fxDocs)
  await writeBatch(expenseDocs)
  await writeBatch(participantDocs)
  await writeBatch(paymentDocs)
  await writeBatch(recurringDocs)

  console.log('Imported into Firestore:')
  console.log(`- profiles: ${profileDocs.length}`)
  console.log(`- groups: ${groupDocs.length}`)
  console.log(`- group members: ${groupMemberDocs.length}`)
  console.log(`- categories: ${categoryDocs.length}`)
  console.log(`- fx rates: ${fxDocs.length}`)
  console.log(`- expenses: ${expenseDocs.length}`)
  console.log(`- expense participants: ${participantDocs.length}`)
  console.log(`- payments: ${paymentDocs.length}`)
  console.log(`- recurring expenses: ${recurringDocs.length}`)
}

run().catch((error) => {
  console.error('\nFirestore import failed:\n', error)
  process.exit(1)
})
