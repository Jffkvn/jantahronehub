import { describe, expect, test } from 'vitest'
import { bankPaymentCsv, mtnBulkPayCsv, nssfCsv, payeCsv, whtCsv } from './paymentFiles'
import { approvedRun } from '../fixtures/approvedRun'

describe('payroll payment and statutory exports', () => {
  test('builds bank and MTN files from immutable payment snapshots', () => {
    expect(bankPaymentCsv(approvedRun)).toContain('"Amina Nsubuga","Stanbic","SBICUGKX","12345",1500000')
    expect(mtnBulkPayCsv(approvedRun)).toContain('0772000000,940000,UGX')
    expect(mtnBulkPayCsv(approvedRun)).not.toContain('EGY-001')
  })
  test('escapes names and includes reconciled statutory totals', () => {
    expect(nssfCsv(approvedRun)).toContain('TOTAL,,,100000,200000,300000')
    expect(payeCsv(approvedRun)).toContain('TOTAL,,,,400000')
    expect(whtCsv(approvedRun)).toContain('"Dora, Atim","TIN2",1000000,60000')
  })
  test('rejects exports before HR approval', () => expect(() => bankPaymentCsv({...approvedRun,status:'draft'})).toThrow(/approved/i))
})
