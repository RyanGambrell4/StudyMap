import { useState, useEffect } from 'react'

/**
 * The Study Coach screens restructure rather than reflow below this width:
 * the hero stacks, list rows drop to two lines, action bars go full width.
 * That is a different tree, not different CSS, so the breakpoint lives in JS.
 *
 * Shared by the plan view and the hub so the two cannot drift apart.
 */
export function useIsMobile(bp = 760) {
  const query = `(max-width:${bp}px)`
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches
  )
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(query)
    const onChange = e => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return isMobile
}

export default useIsMobile
