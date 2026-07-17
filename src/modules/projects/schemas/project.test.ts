import { describe, expect, it } from 'vitest'

import { saveDailyUpdateCommandSchema } from './project'

describe('saveDailyUpdateCommandSchema', () => {
  it.each(['heic', 'heif', 'avif'])('accepts a private daily-evidence .%s path', (extension) => {
    expect(() => saveDailyUpdateCommandSchema.parse({
      updateId: null,
      projectId: '10000000-0000-4000-8000-000000000001',
      updateDate: '2026-07-17',
      summary: 'Phone photo evidence attached.',
      photoUrls: [
        `20000000-0000-4000-8000-000000000002/daily-evidence/10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000003.${extension}`,
      ],
      submit: true,
    })).not.toThrow()
  })
})
