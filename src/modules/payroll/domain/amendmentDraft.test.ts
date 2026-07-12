import { expect, test } from 'vitest'
import { buildAmendmentDraftItems } from './amendmentDraft'

const employees=[{id:'e1',employeeNumber:'EGY-001',employeeName:'Amina',defaultPercentWorked:100}]

test('correction drafts start at zero to prevent duplicate full salary',()=>{
  expect(buildAmendmentDraftItems(employees,['e1'],'correction')).toEqual([{employeeId:'e1',percentOfMonthWorked:0,overtimeHours:0,lineItems:[]}])
})

test('supplemental drafts retain the employee default percentage',()=>{
  expect(buildAmendmentDraftItems(employees,['e1'],'supplemental')[0]?.percentOfMonthWorked).toBe(100)
})
