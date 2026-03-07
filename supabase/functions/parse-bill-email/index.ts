/**
 * Supabase Edge Function: parse-bill-email
 *
 * Accepts two modes:
 *
 * 1. DIRECT mode (Make.com / Google Apps Script / any automation):
 *    POST /parse-bill-email?secret=SECRET
 *    Body: { group_token, pdf_base64, subject?, from_name?, text_body? }
 *
 * 2. POSTMARK inbound webhook (if using Postmark):
 *    POST /parse-bill-email?secret=SECRET
 *    Body: Postmark InboundWebhook JSON (detected automatically)
 *
 * Set POSTMARK_WEBHOOK_SECRET env var to any random string.
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

  // Ordered by specificity — most specific patterns first
  const patterns: { regex: RegExp; currency: string }[] = [
    // Hebrew: סכום לתשלום / סה"כ לתשלום / לתשלום / סה"כ
    { regex: /(?:סכום\s+לתשלום|סה[""׳]\s*כ\s+לתשלום|לתשלום|סה[""׳]\s*כ)\s*:?\s*(?:₪|ש[""׳]ח|ILS|NIS)?\s*([\d,]+(?:\.\d{1,2})?)/i, currency: 'ILS' },
    // Hebrew with ₪ symbol first
    { regex: /₪\s*([\d,]+(?:\.\d{1,2})?)/i, currency: 'ILS' },
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
    const expectedSecret = Deno.env.get('POSTMARK_WEBHOOK_SECRET')
    if (!expectedSecret || secret !== expectedSecret) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const body = await req.json()

    // ── Detect mode: direct call vs Postmark webhook ──────────────────────
    let groupToken: string | null = null
    let pdfBase64: string | null = null
    let subject = ''
    let fromName = ''
    let textBody = ''

    if (body.group_token) {
      // DIRECT MODE — called from Make.com, Apps Script, etc.
      groupToken = body.group_token
      pdfBase64 = body.pdf_base64 ?? null
      subject = body.subject ?? ''
      fromName = body.from_name ?? ''
      textBody = body.text_body ?? ''
    } else {
      // POSTMARK MODE — inbound webhook
      // Extract group token from To address: group-{uuid}@domain
      const toAddresses: string[] = []
      if (body.To) toAddresses.push(body.To)
      if (Array.isArray(body.ToFull)) {
        for (const t of body.ToFull) {
          if (t.Email) toAddresses.push(t.Email)
        }
      }
      for (const addr of toAddresses) {
        const m = addr.match(/group-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
        if (m) { groupToken = m[1]; break }
      }

      const pdfAttachment = (body.Attachments ?? []).find(
        (a: { ContentType?: string; Name?: string }) =>
          a.ContentType === 'application/pdf' || a.Name?.toLowerCase().endsWith('.pdf')
      )
      pdfBase64 = pdfAttachment?.Content ?? null
      subject = body.Subject ?? ''
      fromName = body.FromName ?? body.From ?? ''
      textBody = body.TextBody ?? ''
    }

    if (!groupToken) {
      return new Response(JSON.stringify({ error: 'No group_token provided' }), {
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

    // Fallback to plain text body
    if (!rawText && textBody) rawText = textBody
    if (!rawText && body.HtmlBody) {
      rawText = body.HtmlBody.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
    }

    if (!rawText) {
      return new Response(JSON.stringify({ error: 'No readable content found' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Extract amount ────────────────────────────────────────────────────
    const extracted = extractAmount(rawText, subject || `Bill from ${fromName || 'Unknown'}`)
    if (!extracted) {
      return new Response(JSON.stringify({ error: 'Could not extract amount from bill' }), {
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

    // ── Find "Utilities" category ─────────────────────────────────────────
    const { data: utilityCategory } = await supabase
      .from('categories')
      .select('id')
      .in('group_type', [group.type, 'all'])
      .ilike('name', '%utilit%')
      .limit(1)
      .maybeSingle()

    // ── Create expense ────────────────────────────────────────────────────
    const occurredAt = new Date().toISOString()
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
