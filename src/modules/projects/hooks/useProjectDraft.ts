import { useCallback, useRef, useState } from 'react'

export function useProjectDraft<T>(profileId: string, initialDraft: T) {
  const initialRef = useRef(initialDraft)
  const storageKey = `onehub:project-draft:${profileId}`
  const [draft, setDraftState] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      return saved ? JSON.parse(saved) as T : initialDraft
    } catch {
      return initialDraft
    }
  })

  const setDraft = useCallback((next: T | ((current: T) => T)) => {
    setDraftState((current) => {
      const resolved = typeof next === 'function'
        ? (next as (current: T) => T)(current)
        : next
      sessionStorage.setItem(storageKey, JSON.stringify(resolved))
      return resolved
    })
  }, [storageKey])

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(storageKey)
    setDraftState(initialRef.current)
  }, [storageKey])

  return { draft, setDraft, clearDraft, storageKey }
}
