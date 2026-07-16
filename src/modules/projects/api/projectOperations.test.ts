import { describe, expect, it, vi } from 'vitest'

import { createProjectOperationsApi } from './projectOperations'

describe('project operations API', () => {
  it('loads role-safe history and completion checks through guarded RPCs', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ event_type: 'project.created', occurred_at: '2026-07-16T00:00:00Z', actor_name: 'CFO', reason: 'New contract' }], error: null })
      .mockResolvedValueOnce({ data: { can_complete: false, warnings: [{ domain: 'inventory', message: '1 active custody' }] }, error: null })
    const api = createProjectOperationsApi({ rpc })
    await expect(api.history('11111111-1111-4111-8111-111111111111')).resolves.toHaveLength(1)
    await expect(api.checkCompletion('11111111-1111-4111-8111-111111111111')).resolves.toMatchObject({ canComplete: false })
  })
})
