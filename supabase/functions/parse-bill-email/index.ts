/**
 * Supabase Edge Function: parse-bill-email
 *
 * Accepts three modes (auto-detected from request body shape):
 *
 * 1. MAILJET Parse API webhook (recommended):
 *    POST /parse-bill-email?secret=SECRET
 *    Body: Mailjet inbound array [{ Sender, Recipient, Subject, TextPart, Attachments }]
 *
 * 2. DIRECT mode (any HTTP client / Cloudflare Worker):
 *    POST /parse-bill-email?secret=SECRET
 *    Body: { group_token, pdf_base64?, subject?, from_name?, text_body? }
 *
 * 3. POSTMARK inbound webhook (legacy):
 *    POST /parse-bill-email?secret=SECRET
 *    Body: Postmark InboundWebhook JSON
 *
 * Set WEBHOOK_SECRET env var to any random string (same value in Mailjet webhook URL).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── PDF Text Extraction ──────────────────────────────────────────────────────

/**
 * Extracts readable text from a PDF binary.
 * Works for digitally-created PDFs (utility/internet bills).
 * Handles parenthesis strings and hex-encoded strings in BT/ET blocks.
 */
function extractPDFText(pdfBytes: Uint8Array): string {
  const raw = new TextDecoder('latin1').decode(pdfBytes)
  const parts: string[] = []

  // Find all text blocks (BT...ET)
  const btEtRegex = /BT([\s\S]*?)ET/g
  let block: RegExpExecArray | null
  while ((block = btEtRegex.exec(raw)) !== null) {
    const content = block[1]

    // Parenthesis strings: (text) Tj  or  [(str1)(str2)] TJ
    const parenMatches = content.matchAll(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/g)
    for (const m of parenMatches) {
      const inner = m[1]
        .replace(/\\n/g, ' ')
        .replace(/\\r/g, ' ')
        .replace(/\\t/g, ' ')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\')
      if (inner.trim()) parts.push(inner.trim())
    }

    // Hex strings: <hexdata> Tj
    const hexMatches = content.matchAll(/<([0-9a-fA-F]{4,})>/g)
    for (const h of hexMatches) {
      const hex = h[1]
      // Try UTF-16BE decoding (common for CJK/RTL fonts)
      try {
        const bytes = new Uint8Array(hex.length / 2)
        for (let i = 0; i < hex.length; i += 2) {
          bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
        }
        const decoded = new TextDecoder('utf-16be').decode(bytes)
        if (decoded.trim()) parts.push(decoded.trim())
      } catch {
        // skip undecodable
      }
    }
  }

  // Also try to extract text outside BT/ET (some PDFs don't use standard blocks)
  if (parts.length === 0) {
    const fallback = raw.match(/\(([^\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f()\\]{3,})\)/g) ?? []
    for (const s of fallback) {
      parts.push(s.slice(1, -1))
    }
  }

  return parts.join(' ')
}

// ─── Amount Extraction ────────────────────────────────────────────────────────

interface ExtractedBill {
  amount: number
  currency: string
  label: string
}

function extractAmount(text: string, subject: string): ExtractedBill | null {
  const normalised = text.replace(/\s+/g, ' ')

  // Ordered by specificity — each pattern is tried against the whole string.
  // RTL table OCR can place the number before or after the label, so both orders
  // are handled where needed.
  const Q = '["""״׳]'  // matches all Hebrew quote/geresh variants
  const OPT_CUR = `(?:₪|ש[${Q}']ח|ILS|NIS)?`
  const AMT = `(\\d[\\d,]*(?:\\.\\d{1,2})?)(?![a-zA-Z\\d])`  // capture group: amount (not followed by letters/digits)
  const SKIP = `[^₪\\d\\n]{0,40}`             // skip non-numeric chars (label→number gap)

  const patterns: { regex: RegExp; currency: string }[] = [
    // 1. "סה"כ ... כולל מע"מ ..." label→number  (grand total incl. VAT — most authoritative)
    { regex: new RegExp(`סה${Q}\\s*כ${SKIP}כולל\\s+מע${Q}\\s*מ${SKIP}(?:₪\\s*)?${AMT}`), currency: 'ILS' },
    // 2. number→label variant for RTL table OCR (number appears left of Hebrew text)
    { regex: new RegExp(`${AMT}\\s*(?:₪\\s*)?${SKIP}כולל\\s+מע${Q}\\s*מ`), currency: 'ILS' },
    // 3. "סה"כ לתשלום" label→number
    { regex: new RegExp(`סה${Q}\\s*כ\\s+לתשלום${SKIP}(?:₪\\s*)?${AMT}`), currency: 'ILS' },
    // 4. "סה"כ לתשלום" number→label (arnona style: "6,629.80 ₪")
    { regex: new RegExp(`${AMT}\\s*₪\\s*${SKIP}סה${Q}\\s*כ\\s+לתשלום`), currency: 'ILS' },
    // 5. "סה"כ:" ₪amount  (rav-pas style)
    { regex: new RegExp(`סה${Q}\\s*כ\\s*:\\s*₪\\s*${AMT}`), currency: 'ILS' },
    // 6. "סכום לתשלום"
    { regex: new RegExp(`סכום\\s+לתשלום${SKIP}(?:₪\\s*)?${AMT}`), currency: 'ILS' },
    // 7. Generic "סה"כ [optional Hebrew words] number" (catches "סה"כ מחיר", "סה"כ בש"ח", etc.)
    { regex: new RegExp(`סה${Q}\\s*כ${SKIP}${OPT_CUR}\\s*${AMT}`), currency: 'ILS' },
    // 8. ₪ symbol alone
    { regex: /₪\s*(\d[\d,]*(?:\.\d{1,2})?)/, currency: 'ILS' },
    // English: Amount Due / Total Due / Balance Due / Grand Total / Total
    { regex: /(?:Amount\s+Due|Total\s+Due|Balance\s+Due|Balance\s+Forward|Grand\s+Total|Total\s+Amount|Total)\s*:?\s*(?:\$|€|£|₪|USD|ILS|EUR|GBP)?\s*([\d,]+(?:\.\d{1,2})?)/i, currency: 'USD' },
    // Dollar sign
    { regex: /\$\s*([\d,]+(?:\.\d{1,2})?)/i, currency: 'USD' },
    // Euro sign
    { regex: /€\s*([\d,]+(?:\.\d{1,2})?)/i, currency: 'EUR' },
    // £ sign
    { regex: /£\s*([\d,]+(?:\.\d{1,2})?)/i, currency: 'GBP' },
  ]

  for (const { regex, currency } of patterns) {
    const match = normalised.match(regex)
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ''))
      if (!isNaN(amount) && amount > 0 && amount < 1_000_000) {
        // Derive label from subject, fall back to generic
        const label = subject?.trim()
          ? subject.replace(/^(fwd?|fw):\s*/i, '').trim()
          : 'Bill'
        return { amount, currency, label }
      }
    }
  }

  return null
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validate webhook secret
    const url = new URL(req.url)
    const secret = url.searchParams.get('secret')
    const expectedSecret = Deno.env.get('WEBHOOK_SECRET') ?? Deno.env.get('POSTMARK_WEBHOOK_SECRET')
    if (!expectedSecret || secret !== expectedSecret) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const raw = await req.json()

    // ── Auto-detect source format ─────────────────────────────────────────
    let groupToken: string | null = null
    let pdfBase64: string | null = null
    let subject = ''
    let fromName = ''
    let textBody = ''

    // Helper: extract group token from any email address string
    function extractToken(addr: string): string | null {
      const m = addr.match(/group-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
      return m ? m[1] : null
    }

    if (Array.isArray(raw) && raw[0]?.Recipient) {
      // ── MAILJET Parse API ─────────────────────────────────────────────
      // Body: [{ Sender, Recipient, Subject, TextPart, HtmlPart, Attachments }]
      const msg = raw[0]
      groupToken = extractToken(msg.Recipient ?? '')
      subject = msg.Subject ?? ''
      fromName = msg.Sender ?? ''
      textBody = msg.TextPart ?? ''

      // Mailjet attachment: { Filename, ContentType, Base64Content }
      type MJAttachment = { Filename?: string; ContentType?: string; Base64Content?: string }
      const pdfAtt = (msg.Attachments as MJAttachment[] ?? []).find(
        a => a.ContentType === 'application/pdf' || a.Filename?.toLowerCase().endsWith('.pdf')
      )
      pdfBase64 = pdfAtt?.Base64Content ?? null

    } else if (raw.group_token) {
      // ── DIRECT MODE (Cloudflare Worker, custom client) ────────────────
      groupToken = raw.group_token
      pdfBase64 = raw.pdf_base64 ?? null
      subject = raw.subject ?? ''
      fromName = raw.from_name ?? ''
      textBody = raw.text_body ?? ''
      // Strip HTML if plain body is empty
      if (!textBody && raw.html_body) {
        textBody = (raw.html_body as string).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
      }

    } else {
      // ── POSTMARK inbound webhook ──────────────────────────────────────
      const toAddresses: string[] = []
      if (raw.To) toAddresses.push(raw.To)
      if (Array.isArray(raw.ToFull)) {
        for (const t of raw.ToFull) { if (t.Email) toAddresses.push(t.Email) }
      }
      for (const addr of toAddresses) {
        const t = extractToken(addr)
        if (t) { groupToken = t; break }
      }
      type PMAttachment = { ContentType?: string; Name?: string; Content?: string }
      const pdfAtt = (raw.Attachments as PMAttachment[] ?? []).find(
        a => a.ContentType === 'application/pdf' || a.Name?.toLowerCase().endsWith('.pdf')
      )
      pdfBase64 = pdfAtt?.Content ?? null
      subject = raw.Subject ?? ''
      fromName = raw.FromName ?? raw.From ?? ''
      textBody = raw.TextBody ?? ''
    }

    if (!groupToken) {
      return new Response(JSON.stringify({ error: 'No group token found in recipient address' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Look up group ─────────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: group, error: groupErr } = await supabase
      .from('groups')
      .select('*, members:group_members(user_id, role)')
      .eq('inbound_email_token', groupToken)
      .single()

    if (groupErr || !group) {
      return new Response(JSON.stringify({ error: 'Group not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Extract text from PDF (or email body) ────────────────────────────
    let rawText = ''

    if (pdfBase64) {
      try {
        const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0))
        rawText = extractPDFText(pdfBytes)
      } catch (e) {
        console.warn('PDF extraction failed:', e)
      }
    }

    // Always append email text body — PDF may be image-based (no extractable text)
    if (textBody) rawText = (rawText + ' ' + textBody).trim()
    if (!rawText && raw.HtmlBody) {
      rawText = (raw.HtmlBody as string).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
    }

    if (!rawText) {
      return new Response(JSON.stringify({ error: 'No readable content found' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Debug mode: return raw extracted text ─────────────────────────────
    if (url.searchParams.get('debug') === '1') {
      return new Response(JSON.stringify({ debug: true, raw_text: rawText.slice(0, 4000) }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Extract amount ────────────────────────────────────────────────────
    const extracted = extractAmount(rawText, subject || `Bill from ${fromName || 'Unknown'}`)
    if (!extracted) {
      return new Response(JSON.stringify({ error: 'Could not extract amount from bill', raw_text_sample: rawText.slice(0, 2000) }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Determine payer and participants ──────────────────────────────────
    const memberIds: string[] = (group.members as { user_id: string }[]).map(m => m.user_id)
    const payerId: string = group.bill_default_payer_id ?? group.created_by

    // If configured payer is not in members list, fall back to creator
    const resolvedPayerId = memberIds.includes(payerId) ? payerId : group.created_by

    // ── Get FX rate ───────────────────────────────────────────────────────
    const groupCurrency: string = group.base_currency
    let fxRate = 1

    if (extracted.currency !== groupCurrency) {
      const today = new Date().toISOString().slice(0, 10)
      const { data: fxRow } = await supabase
        .from('fx_rates')
        .select('rates_json')
        .eq('base_currency', groupCurrency)
        .lte('date', today)
        .order('date', { ascending: false })
        .limit(1)
        .single()

      if (fxRow?.rates_json) {
        fxRate = (fxRow.rates_json as Record<string, number>)[extracted.currency]
          ? 1 / (fxRow.rates_json as Record<string, number>)[extracted.currency]
          : 1
      }
    }

    // ── Convert amounts to minor units ────────────────────────────────────
    const decimals = ['JPY', 'KRW', 'VND'].includes(extracted.currency) ? 0 : 2
    const groupDecimals = ['JPY', 'KRW', 'VND'].includes(groupCurrency) ? 0 : 2
    const factor = Math.pow(10, decimals)
    const groupFactor = Math.pow(10, groupDecimals)

    const originalMinor = Math.round(extracted.amount * factor)
    const groupMinor = Math.max(1, Math.round(extracted.amount * fxRate * groupFactor))

    const sharePerMember = memberIds.length > 0 ? Math.round(groupMinor / memberIds.length) : groupMinor

    // ── Deduplication check ───────────────────────────────────────────────
    // Reject if same group + same amount + same sender already exists within the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: duplicate } = await supabase
      .from('expenses')
      .select('id')
      .eq('group_id', group.id)
      .eq('original_amount', originalMinor)
      .eq('original_currency', extracted.currency)
      .ilike('notes', `%${fromName}%`)
      .gte('occurred_at', sevenDaysAgo)
      .limit(1)
      .maybeSingle()

    if (duplicate) {
      console.log(`Duplicate expense detected for group ${group.id}, skipping.`)
      return new Response(
        JSON.stringify({ skipped: true, reason: 'Duplicate expense already recorded', existing_id: duplicate.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Detect category from Gmail sub-label, sender, or subject ─────────
    const categoryHint: string = (raw.category_hint as string ?? '').trim()
    const senderHint = `${fromName} ${subject}`.toLowerCase()

    // Sub-label → DB category search term
    const LABEL_CATEGORY_MAP: Record<string, string> = {
      'אינטרנט': 'phone',
      'ארנונה': 'household',
      'חשמל וגז': 'electric',
      'טלפון': 'phone',
      'מים': 'water',
      'רבפס': 'transport',
      'רב פס': 'transport',
    }

    const SENDER_CATEGORY_MAP: { keywords: string[]; search: string }[] = [
      { keywords: ['רב פס', 'רב-פס', 'rav pas', 'ravpas', 'rav-pas'], search: 'transport' },
      { keywords: ['openai', 'anthropic'], search: 'ai' },
      { keywords: ['pelephone', 'פלאפון', 'partner', 'פרטנר'], search: 'phone' },
      { keywords: ['electra', 'אלקטרה'], search: 'electric' },
      { keywords: ['ארנונה'], search: 'household' },
      { keywords: ['מי 7', 'מי7', 'water'], search: 'water' },
    ]

    let categorySearch = LABEL_CATEGORY_MAP[categoryHint] ?? ''
    if (!categorySearch) {
      for (const { keywords, search } of SENDER_CATEGORY_MAP) {
        if (keywords.some(k => senderHint.includes(k.toLowerCase()))) {
          categorySearch = search
          break
        }
      }
    }
    if (!categorySearch) categorySearch = 'utilit' // default fallback

    // ── Find category in DB ───────────────────────────────────────────────
    const { data: utilityCategory } = await supabase
      .from('categories')
      .select('id')
      .in('group_type', [group.type, 'all'])
      .ilike('name', `%${categorySearch}%`)
      .limit(1)
      .maybeSingle()

    // ── Create expense ────────────────────────────────────────────────────
    const emailDate = raw.email_date ? new Date(raw.email_date as string) : null
    const occurredAt = (emailDate && !isNaN(emailDate.getTime()) ? emailDate : new Date()).toISOString()
    const fxDate = occurredAt.slice(0, 10)

    const { data: expense, error: expErr } = await supabase
      .from('expenses')
      .insert({
        group_id: group.id,
        created_by: resolvedPayerId,
        label: extracted.label,
        notes: `Auto-imported from email: ${fromName}`,
        original_amount: originalMinor,
        original_currency: extracted.currency,
        group_amount: groupMinor,
        group_currency: groupCurrency,
        fx_rate: fxRate,
        fx_date: fxDate,
        category_id: utilityCategory?.id ?? null,
        category_confidence: utilityCategory ? 0.8 : null,
        occurred_at: occurredAt,
      })
      .select()
      .single()

    if (expErr || !expense) {
      console.error('Expense insert failed:', expErr)
      return new Response(JSON.stringify({ error: 'Failed to create expense' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Create participants ───────────────────────────────────────────────
    const participantRows = [
      // Payer row
      {
        expense_id: expense.id,
        user_id: resolvedPayerId,
        role: 'payer',
        weight: 1,
        share_amount_group_currency: groupMinor,
      },
      // Participant rows (equal split among all members)
      ...memberIds.map((uid, i) => ({
        expense_id: expense.id,
        user_id: uid,
        role: 'participant',
        weight: 1,
        share_amount_group_currency:
          i < memberIds.length - 1
            ? sharePerMember
            : groupMinor - sharePerMember * (memberIds.length - 1),
      })),
    ]

    const { error: partErr } = await supabase
      .from('expense_participants')
      .insert(participantRows)

    if (partErr) {
      console.error('Participants insert failed:', partErr)
      // Expense was created — don't fail the webhook
    }

    console.log(`Created expense ${expense.id} for group ${group.id}: ${extracted.amount} ${extracted.currency}`)

    return new Response(
      JSON.stringify({
        success: true,
        expense_id: expense.id,
        amount: extracted.amount,
        currency: extracted.currency,
        label: extracted.label,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Unhandled error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
