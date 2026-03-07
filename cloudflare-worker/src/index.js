/**
 * Cloudflare Email Worker — Splittter Bill Receiver
 *
 * Receives emails sent to group-{token}@yourdomain.com,
 * parses the PDF attachment, and calls the Supabase edge function
 * to create the expense in the correct group.
 *
 * Required Worker env vars (set via wrangler.toml or dashboard):
 *   SUPABASE_FUNCTION_URL  — e.g. https://xyz.supabase.co/functions/v1/parse-bill-email
 *   WEBHOOK_SECRET         — same value as POSTMARK_WEBHOOK_SECRET in Supabase
 */

import PostalMime from 'postal-mime'

function arrayBufferToBase64(buffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  // Process in chunks to avoid call stack limits on large PDFs
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export default {
  async email(message, env, ctx) {
    // ── Extract group token from the To address ────────────────────────────
    // Expected format: group-{uuid}@yourdomain.com
    const to = message.to
    const tokenMatch = to.match(/group-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)

    if (!tokenMatch) {
      console.warn(`Email to ${to} has no group token — ignoring`)
      // Don't reject — silently drop (avoids bounce storms)
      return
    }

    const groupToken = tokenMatch[1]

    // ── Parse the full MIME email ──────────────────────────────────────────
    const parser = new PostalMime()
    const rawEmail = message.raw
    const parsed = await parser.parse(rawEmail)

    // ── Find PDF attachment ────────────────────────────────────────────────
    let pdfBase64 = null
    const pdfAttachment = parsed.attachments.find(
      a => a.mimeType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')
    )

    if (pdfAttachment?.content) {
      pdfBase64 = arrayBufferToBase64(pdfAttachment.content)
    }

    if (!pdfBase64 && !parsed.text) {
      console.warn('No PDF and no text body — cannot extract amount')
      return
    }

    // ── Call Supabase edge function ────────────────────────────────────────
    const url = `${env.SUPABASE_FUNCTION_URL}?secret=${env.WEBHOOK_SECRET}`

    const payload = {
      group_token: groupToken,
      pdf_base64: pdfBase64,
      subject: parsed.subject ?? '',
      from_name: parsed.from?.name || parsed.from?.address || '',
      text_body: parsed.text ?? '',
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (response.ok) {
      const result = await response.json()
      console.log(`Created expense for group ${groupToken}:`, result)
    } else {
      const err = await response.text()
      console.error(`Edge function error (${response.status}):`, err)
    }
  },
}
