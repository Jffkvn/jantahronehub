import { describe, expect, it } from 'vitest'
import { trainingRecordInputSchema } from './training'

describe('trainingRecordInputSchema', () => {
  it('accepts the legacy training fields for multiple employees', () => {
    const value = trainingRecordInputSchema.parse({ employeeIds: [crypto.randomUUID(), crypto.randomUUID()], topic: 'Fire Safety', provider: 'Uganda Red Cross', completionDate: '2026-07-18', durationHours: 4, cost: 120000, status: 'passed', expiryDate: '2027-07-18', certificateReference: 'CERT-001' })
    expect(value.employeeIds).toHaveLength(2)
  })
  it('rejects an expiry before completion', () => {
    expect(() => trainingRecordInputSchema.parse({ employeeIds: [crypto.randomUUID()], topic: 'Safety', completionDate: '2026-07-18', status: 'passed', expiryDate: '2026-07-17' })).toThrow(/expiry/i)
  })
})
