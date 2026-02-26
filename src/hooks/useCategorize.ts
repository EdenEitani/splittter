import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { CategorizeResult, GroupType } from '@/types'

/**
 * Debounced LLM-powered category suggestion.
 * Calls the categorize-expense edge function 400ms after label changes.
 */
export function useCategorize(
  label: string,
  groupType: GroupType,
  debounceMs = 400
) {
  const [result, setResult] = useState<CategorizeResult | null>(null)
  const [loading, setLoading] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!label || label.trim().length < 2) {
      setResult(null)
      return
    }

    // Clear previous debounce
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    timeoutRef.current = setTimeout(async () => {
      // Cancel previous request
      abortRef.current?.abort()
      abortRef.current = new AbortController()

      setLoading(true)
      try {
        const { data, error } = await supabase.functions.invoke<CategorizeResult>(
          'categorize-expense',
          {
            body: { label: label.trim(), group_type: groupType },
          }
        )

        if (!error && data) {
          setResult(data)
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.warn('[useCategorize]', err)
        }
      } finally {
        setLoading(false)
      }
    }, debounceMs)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [label, groupType, debounceMs])

  function dismiss() {
    setResult(null)
  }

  return { result, loading, dismiss }
}
