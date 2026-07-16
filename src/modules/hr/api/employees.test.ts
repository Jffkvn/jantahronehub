import { expect, test } from 'vitest'
import type { EmployeeFormValues } from '../schemas/employee'
import { toEmployeeRpcPayload } from './employees'

test('sends the explicitly selected payment method to the atomic employee workflow', () => {
  const values = { paymentMethod: 'mobile_money' } as EmployeeFormValues
  expect(toEmployeeRpcPayload(values).employee_data.payment_method).toBe('mobile_money')
})

test('sends the selected pay grade to the atomic employment workflow', () => {
  const values = { payGradeId: 'grade-1' } as EmployeeFormValues
  expect(toEmployeeRpcPayload(values).period_data.pay_grade_id).toBe('grade-1')
})
