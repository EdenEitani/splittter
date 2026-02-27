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
  'Food':      ['restaurant', 'food', 'lunch', 'dinner', 'breakfast', 'meal', 'eat', 'pizza', 'burger', 'sushi',
                'bar', 'beer', 'wine', 'cocktail', 'drinks', 'alcohol', 'pub',
                'coffee', 'cafe', 'starbucks', 'latte', 'espresso', 'cappuccino',
                'מסעדה', 'אוכל', 'ארוחה', 'ארוחת', 'פיצה', 'המבורגר', 'סושי', 'פלאפל', 'שוורמה', 'גלידה', 'מקדונלדס', 'פיצרייה',
                'בר', 'בירה', 'יין', 'קוקטייל', 'משקאות', 'אלכוהול',
                'קפה', 'בית קפה', 'לאטה', 'אספרסו'],
  'Shopping':  ['shop', 'mall', 'amazon', 'buy', 'purchase', 'store', 'market',
                'קניות', 'קניון', 'חנות', 'קנייה', 'שוק'],
  'Transport': ['bus', 'metro', 'subway', 'train', 'tram', 'transport', 'commute',
                'uber', 'lyft', 'taxi', 'cab', 'ride', 'bolt', 'grab',
                'אוטובוס', 'רכבת', 'מטרו', 'תחבורה', 'טרמפ',
                'מונית', 'גט', 'טקסי', 'נסיעה', 'כרטיסים מטרו', 'מס'],
}

const TYPE_KEYWORDS: Record<string, KeywordMap> = {
  trip: {
    'Flights':       ['flight', 'plane', 'airline', 'airport', 'airfare', 'united', 'delta', 'lufthansa', 'ryanair',
                      'טיסה', 'טיסות', 'נמל תעופה', 'אל על', 'ויזאייר', 'ראיינאיר'],
    'Accommodation': ['hotel', 'motel', 'resort', 'marriott', 'hilton', 'sheraton', 'inn',
                      'airbnb', 'vrbo', 'hostel', 'accommodation', 'booking', 'apartment', 'stay',
                      'מלון', 'אכסניה', 'ריזורט', 'דירה', 'לינה', 'הוסטל', 'אירוח', 'פנסיון'],
    'Activities':    ['tour', 'ticket', 'museum', 'show', 'concert', 'theme park', 'attraction', 'zoo',
                      'guided', 'sightseeing', 'walking tour', 'excursion',
                      'כרטיס', 'מוזיאון', 'הופעה', 'קונצרט', 'גן חיות', 'אטרקציה', 'סיור', 'טיול', 'מדריך'],
    'Transport':     ['rental', 'rent a car', 'hertz', 'avis', 'enterprise', 'sixt',
                      'amtrak', 'eurostar', 'train', 'rail', 'tgv', 'ferry', 'boat', 'bus',
                      'parking', 'autostrada', 'highway', 'toll',
                      'השכרת רכב', 'השכרה', 'רכבת', 'קרון', 'מעבורת', 'חניה', 'אוטוסטרדה', 'כביש אגרה'],
  },
  house: {
    'Rent':        ['rent', 'lease', 'landlord',
                   'שכירות', 'שכד', 'שכ"ד', 'שכ״ד', 'דמי שכירות', 'משכירה'],
    'Electricity': ['electricity', 'power', 'electric', 'pg&e', 'con ed', 'utility',
                   'חשמל', 'חברת חשמל', 'חשבון חשמל'],
    'Water':       ['water', 'sewage', 'plumbing',
                   'מים', 'ביוב', 'צנרת'],
    'Gas':         ['gas', 'heating', 'propane',
                   'גז', 'חימום'],
    'Internet':    ['internet', 'wifi', 'broadband', 'comcast', 'at&t', 'spectrum', 'fiber',
                   'אינטרנט', 'ווייפי', 'סיב אופטי', 'בזק', 'הוט'],
    'Groceries':   ['grocery', 'supermarket', 'whole foods', 'trader joe', 'kroger', 'safeway', 'aldi',
                   'קניות', 'סופרמרקט', 'מכולת', 'רמי לוי', 'שופרסל', 'ביג', 'מגה', 'יינות ביתן'],
    'Cleaning':    ['cleaning', 'laundry', 'detergent', 'mop', 'vacuum', 'trash',
                   'ניקיון', 'כביסה', 'אשפה', 'שואב אבק'],
    'Repairs':     ['repair', 'fix', 'maintenance', 'plumber', 'electrician', 'contractor',
                   'תיקון', 'אחזקה', 'שיפוץ', 'נגר', 'חשמלאי', 'אינסטלטור'],
    'Subscriptions': ['netflix', 'spotify', 'hulu', 'amazon prime', 'disney', 'subscription',
                   'נטפליקס', 'ספוטיפיי', 'מנוי', 'הוט', 'יס', 'סלקום', 'פרטנר'],
  },
  event: {
    'Venue':    ['venue', 'hall', 'space', 'location', 'booking',
                'אולם', 'מקום', 'חלל'],
    'Catering': ['catering', 'buffet', 'food service', 'appetizer', 'dessert',
                'קייטרינג', 'בופה', 'כיבוד', 'מזון'],
    'Decor':    ['decoration', 'flowers', 'balloons', 'banner', 'tablecloth',
                'עיצוב', 'פרחים', 'בלונים', 'קישוטים'],
    'Music':    ['dj', 'band', 'music', 'speaker', 'microphone',
                'דיג׳יי', 'להקה', 'מוזיקה', 'רמקול'],
    'Photos':   ['photographer', 'photos', 'camera', 'video',
                'צלם', 'תמונות', 'צילום', 'וידאו'],
    'Gifts':    ['gift', 'present', 'wrap', 'ribbon',
                'מתנה', 'מתנות', 'אריזה'],
  },
  roommates: {
    'Rent':          ['rent', 'lease',
                     'שכירות', 'שכד', 'שכ"ד', 'שכ״ד'],
    'Utilities':     ['utility', 'electric', 'gas', 'water', 'bill',
                     'חשבון', 'חשמל', 'מים', 'גז', 'ארנונה'],
    'Internet':      ['internet', 'wifi', 'cable',
                     'אינטרנט', 'ווייפי', 'בזק'],
    'Groceries':     ['grocery', 'food', 'supermarket',
                     'קניות', 'סופרמרקט', 'מכולת', 'אוכל'],
    'Household':     ['soap', 'toilet paper', 'cleaning', 'supplies', 'household',
                     'ניקיון', 'נייר', 'סבון', 'ציוד'],
    'Subscriptions': ['netflix', 'hulu', 'spotify', 'subscription',
                     'נטפליקס', 'מנוי'],
  },
  custom: {},
}

// ─── Hebrew universal keywords (always checked regardless of group type) ───────
// Covers common Israeli expense labels for custom/untyped groups.

const HEBREW_UNIVERSAL_KEYWORDS: KeywordMap = {
  'Rent':          ['שכירות', 'שכד', 'שכ"ד', 'שכ״ד', 'שכ׳ד', 'דמי שכירות', 'משכירה', 'מחייר'],
  'Electricity':   ['חשמל', 'חברת חשמל', 'חשבון חשמל'],
  'Water':         ['מים', 'ביוב', 'צנרת', 'מי עכו', 'מי אביב'],
  'Gas':           ['גז', 'חימום', 'גז ישיר'],
  'Internet':      ['אינטרנט', 'ווייפי', 'בזק', 'הוט נט', 'סלקום נט', 'פרטנר נט'],
  'Groceries':     ['סופרמרקט', 'מכולת', 'רמי לוי', 'שופרסל', 'ביג', 'מגה', 'יינות ביתן', 'אושר עד'],
  'Utilities':     ['ארנונה', 'חשבון', 'ועד בית', 'ועד'],
  'Cleaning':      ['ניקיון', 'כביסה', 'שואב אבק', 'מנקה'],
  'Repairs':       ['תיקון', 'אחזקה', 'שיפוץ', 'נגר', 'חשמלאי', 'אינסטלטור', 'נזילה'],
  'Subscriptions': ['נטפליקס', 'ספוטיפיי', 'מנוי', 'הוט', 'יס', 'סלקום', 'פרטנר', 'חן נט'],
  'Flights':       ['טיסה', 'טיסות', 'נמל תעופה', 'אל על', 'ויזאייר', 'ראיינאיר'],
  'Accommodation': ['מלון', 'אכסניה', 'ריזורט', 'פנסיון', 'לינה', 'הוסטל', 'אירוח', 'דירה'],
  'Activities':    ['כרטיס', 'מוזיאון', 'הופעה', 'קונצרט', 'גן חיות', 'אטרקציה', 'סיור', 'טיול'],
  'Shopping':      ['קניות', 'קניון', 'אמזון', 'זארה', 'H&M', 'קסטרו', 'רנואר', 'פוקס'],
  'Food':          ['מסעדה', 'אוכל', 'ארוחה', 'פיצה', 'פלאפל', 'שוורמה', 'המבורגר', 'סלט', 'קינוח', 'בית קפה', 'גלידה', 'מקדונלדס', 'קפה'],
  'Gifts':         ['מתנה', 'מתנות', 'אריזה', 'גיפט קארד'],
  'Health':        ['מרפאה', 'רופא', 'תרופה', 'ביטוח', 'קופת חולים', 'לייזר', 'פיזיו'],
  'Transport':     ['אוטובוס', 'רכבת', 'מטרו', 'תחבורה', 'טרמפ', 'גט', 'מונית', 'מוניות',
                    'השכרת רכב', 'השכרה', 'אלדן', 'הרץ', 'בודג׳ט', 'חניה', 'אוטוסטרדה', 'מכס', 'דלק'],
}

function heuristicClassify(
  label: string,
  groupType: string,
  categories: { id: string; name: string }[]
): { category_id: string; confidence: number; reasoning: string } | null {
  // Normalize: lowercase for Latin, keep Hebrew as-is (already case-invariant)
  const lower = label.toLowerCase()
  const typeMap = TYPE_KEYWORDS[groupType] ?? {}

  // Detect if label contains Hebrew characters
  const hasHebrew = /[\u0590-\u05FF\uFB1D-\uFB4F]/.test(label)

  // Combine type-specific + global + (always) Hebrew universal keywords
  const allKeywords: Record<string, string[]> = {
    ...typeMap,
    ...GLOBAL_KEYWORDS,
    ...(hasHebrew ? HEBREW_UNIVERSAL_KEYWORDS : {}),
  }

  let bestName = ''
  let bestScore = 0

  for (const [catName, keywords] of Object.entries(allKeywords)) {
    for (const kw of keywords) {
      // For Hebrew keywords match against original label (lowercased covers Latin too)
      const haystack = /[\u0590-\u05FF\uFB1D-\uFB4F]/.test(kw) ? label : lower
      if (haystack.includes(kw)) {
        const score = kw.length // prefer longer/more specific matches
        if (score > bestScore) {
          bestScore = score
          bestName = catName
        }
      }
    }
  }

  if (!bestName) return null

  // Try exact name match first, then partial match
  let cat = categories.find(c => c.name.toLowerCase() === bestName.toLowerCase())
  if (!cat) {
    // Try contains match (e.g. 'Car Rental' might match category 'Rental')
    cat = categories.find(c =>
      bestName.toLowerCase().includes(c.name.toLowerCase()) ||
      c.name.toLowerCase().includes(bestName.toLowerCase())
    )
  }
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

      const prompt = `You are an expense categorization assistant. You support English and Hebrew labels.

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

Pick the most appropriate category. The label may be in Hebrew — interpret it accordingly. If none fit well, use the "General" or "Other" category id.`

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
