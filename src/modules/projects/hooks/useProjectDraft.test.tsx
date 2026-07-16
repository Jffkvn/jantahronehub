import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useProjectDraft } from './useProjectDraft'

describe('useProjectDraft', () => {
  beforeEach(() => sessionStorage.clear())

  it('restores a profile-scoped draft and clears it explicitly', () => {
    const { result, unmount } = renderHook(() =>
      useProjectDraft('profile-1', { name: '', projectCode: '' }),
    )
    act(() => result.current.setDraft({ name: 'Saved project', projectCode: 'PRJ-9' }))
    unmount()
    const restored = renderHook(() =>
      useProjectDraft('profile-1', { name: '', projectCode: '' }),
    )
    expect(restored.result.current.draft.name).toBe('Saved project')
    act(() => restored.result.current.clearDraft())
    expect(sessionStorage.getItem('onehub:project-draft:profile-1')).toBeNull()
  })
})
