import { expect, test } from 'vitest'
import { buildMasterPayrollRows } from './masterPayroll'
import { approvedRun } from '../fixtures/approvedRun'

test('master payroll rows reconcile to approved run totals', () => {
  const rows=buildMasterPayrollRows(approvedRun)
  expect(rows.at(-1)).toMatchObject({'Employee Name':'TOTALS','Net Pay':2440000,'Gross Earnings':3000000})
})
