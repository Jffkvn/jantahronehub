import { expect, test } from 'vitest'
import { payrollRunListSelection } from './payroll'

test('payroll list selection excludes employee and payment snapshots',()=>{
  expect(payrollRunListSelection).not.toContain('payroll_items')
  expect(payrollRunListSelection).not.toContain('account_number')
  expect(payrollRunListSelection).not.toContain('tin_number')
})
