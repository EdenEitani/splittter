// Supabase Edge Function: categorize-expense
// Classifies an expense label into a category using LLM (OpenAI) with keyword fallback.
//
// Request body: { label: string, group_type: string }
// Response:     { category_id: string, confidence: number, reasoning: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Keyword heuristics (fallback when LLM unavailable) ───────
type KeywordMap = Record<string, string[]>

const GLOBAL_KEYWORDS: KeywordMap = {
  'Food':       ['restaurant', 'food', 'lunch', 'dinner', 'breakfast', 'meal', 'eat', 'pizza', 'burger', 'sushi'],
  'Drinks':     ['bar', 'beer', 'wine', 'cocktail', 'drinks', 'alcohol', 'pub'],
  'Coffee':     ['coffee', 'cafe', 'starbucks', 'latte', 'espresso', 'cappuccino'],
  'Shopping':   ['shop', 'mall', 'amazon', 'buy', 'purchase', 'store', 'market'],
  'Transport':  ['bus', 'metro', 'subway', 'train', 'tram', 'transport', 'commute'],
  'Taxi/Uber':  ['uber', 'lyft', 'taxi', 'cab', 'ride', 'bolt', 'grab'],
}

const TYPE_KEYWORDS: Record<string, KeywordMap> = {
  trip: {
    'Flights':    ['flight', 'plane', 'airline', 'airport', 'airfare', 'united', 'delta', 'lufthansa', 'ryanair'],
    'Hotel':      ['hotel', 'motel', 'resort', 'marriott', 'hilton', 'sheraton', 'inn'],
    'Lodging':    ['airbnb', 'vrbo', 'hostel', 'accommodation', 'booking', 'apartment', 'stay'],
    'Activities': ['tour', 'ticket', 'museum', 'show', 'concert', 'theme park', 'attraction', 'zoo'],
    'Car Rental': ['rental', 'rent a car', 'hertz', 'avis', 'enterprise', 'sixt'],
    'Train':      ['amtrak', 'eurostar', 'train', 'rail', 'tgv', 'intercity'],
    'Tours':      ['guided', 'sightseeing', 'walking tour', 'excursion'],
  },
  house: {
    'Rent':        ['rent', 'lease', 'landlord'],
    'Electricity': ['electricity', 'power', 'electric', 'pg&e', 'con ed', 'utility'],
    'Water':       ['water', 'sewage', 'plumbing'],
    'Gas':         ['gas', 'heating', 'propane'],
    'Internet':    ['internet', 'wifi', 'broadband', 'comcast', 'at&t', 'spectrum', 'fiber'],
    'Groceries':   ['grocery', 'supermarket', 'whole foods', 'trader joe', 'kroger', 'safeway', 'aldi'],
    'Cleaning':    ['cleaning', 'laundry', 'detergent', 'mop', 'vacuum', 'trash'],
    'Repairs':     ['repair', 'fix', 'maintenance', 'plumber', 'electrician', 'contractor'],
    'Subscriptions': ['netflix', 'spotify', 'hulu', 'amazon prime', 'disney', 'subscription'],
  },
  event: {
    'Venue':    ['venue', 'hall', 'space', 'location', 'booking'],
    'Catering': ['catering', 'buffet', 'food service', 'appetizer', 'dessert'],
    'Decor':    ['decoration', 'flowers', 'balloons', 'banner', 'tablecloth'],
    'Music':    ['dj', 'band', 'music', 'speaker', 'microphone'],
    'Photos':   ['photographer', 'photos', 'camera', 'video'],
    'Gifts':    ['gift', 'present', 'wrap', 'ribbon'],
  },
  roommates: {
    'Rent':          ['rent', 'lease'],
    'Utilities':     ['utility', 'electric', 'gas', 'water', 'bill'],
    'Internet':      ['internet', 'wifi', 'cable'],
    'Groceries':     ['grocery', 'food', 'supermarket'],
    'Household':     ['soap', 'toilet paper', 'cleaning', 'supplies', 'household'],
    'Subscriptions': ['netflix', 'hulu', 'spotify', 'subscription'],
  },
  custom: {},
}

function heuristicClassify(
  label: string,
  groupType: string,
  categories: { id: string; name: string }[]
): { category_id: string; confidence: number; reasoning: string } | null {
  const lower = label.toLowerCase()
  const typeMap = TYPE_KEYWORDS[groupType] ?? {}

  // Combine type-specific + global keywords
  const allKeywords: Record<string, string[]> = {
    ...typeMap,
    ...GLOBAL_KEYWORDS,
  }

  let bestName = ''
  let bestScore = 0

  for (const [catName, keywords] of Object.entries(allKeywords)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        const score = kw.length // prefer longer/more specific matches
        if (score > bestScore) {
          bestScore = score
          bestName = catName
        }
      }
    }
  }

  if (!bestName) return null

  const cat = categories.find(c =>
    c.name.toLowerCase() === bestName.toLowerCase()
  )
  if (!cat) return null

  return {
    category_id: cat.id,
    confidence: 0.65,
    reasoning: `Matched keyword for "${bestName}" category.`,
  }
}

// ─── Main handler ──────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { label, group_type } = await req.json() as {
      label: string
      group_type: string
    }

    if (!label || typeof label !== 'string') {
      return new Response(
        JSON.stringify({ error: 'label is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch categories for this group type
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: categories } = await supabase
      .from('categories')
      .select('id, name, group_type')
      .in('group_type', [group_type, 'all'])
      .order('sort_order')

    const cats = categories ?? []

    const openaiKey = Deno.env.get('OPENAI_API_KEY')

    // ── LLM path ───────────────────────────────────────────────
    if (openaiKey && cats.length > 0) {
      const categoryList = cats.map(c => `- ${c.name} (id: ${c.id})`).join('\n')

      const prompt = `You are an expense categorization assistant.

Group type: ${group_type}
Expense label: "${label}"

Available categories:
${categoryList}

Respond ONLY with valid JSON (no markdown, no explanation outside JSON):
{
  "category_id": "<exact id from list>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<one sentence explanation>"
}

Pick the most appropriate category. If none fit well, use the "General" or "Other" category id.`

      try {
        const llmRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_tokens: 200,
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(8000),
        })

        if (llmRes.ok) {
          const llmData = await llmRes.json() as {
            choices: { message: { content: string } }[]
          }
          const content = llmData.choices?.[0]?.message?.content ?? '{}'
          const parsed = JSON.parse(content) as {
            category_id: string
            confidence: number
            reasoning: string
          }

          // Validate that the returned category_id exists
          const valid = cats.find(c => c.id === parsed.category_id)
          if (valid) {
            return new Response(
              JSON.stringify(parsed),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }
      } catch (err) {
        console.warn('[categorize-expense] LLM call failed, falling back:', err)
      }
    }

    // ── Heuristic fallback ─────────────────────────────────────
    const fallback = heuristicClassify(label, group_type, cats)
    if (fallback) {
      return new Response(
        JSON.stringify(fallback),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Default: "General" or first category ──────────────────
    const general = cats.find(c => c.name === 'General') ?? cats[0]
    const defaultResult = {
      category_id: general?.id ?? '',
      confidence: 0.3,
      reasoning: 'No specific match found; using General category.',
    }

    return new Response(
      JSON.stringify(defaultResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[categorize-expense] error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
