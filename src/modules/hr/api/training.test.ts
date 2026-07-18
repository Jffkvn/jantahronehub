import { expect, test, vi } from 'vitest'
import { createTrainingApi } from './training'

test('maps HR training history and preserves certificate metadata', async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ data: 0, error: null }).mockResolvedValueOnce({ data: [{ id: crypto.randomUUID(), employee_id: crypto.randomUUID(), employee_number: 'EGY-001', employee_name: 'Amina', topic: 'Safety', provider: 'Red Cross', completion_date: '2026-07-18', duration_hours: 4, cost_ugx: 120000, status: 'passed', expiry_date: '2027-07-18', certificate_reference: 'CERT-1', certificate_count: 1, created_at: '2026-07-18T00:00:00Z' }], error: null })
  const rows = await createTrainingApi({ rpc }).listForHr()
  expect(rows[0]).toMatchObject({ employeeName: 'Amina', certificateReference: 'CERT-1', certificateCount: 1 })
})
