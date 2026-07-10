import { describe, expect, it } from 'vitest'

import { formatKampalaDate } from './formatKampalaDate'

describe('formatKampalaDate', () => {
  it('formats the current day in Africa/Kampala rather than UTC', () => {
    const nearMidnightUtc = new Date('2026-07-10T22:30:00.000Z')

    expect(formatKampalaDate(nearMidnightUtc)).toBe('Saturday, 11 July')
  })
})
