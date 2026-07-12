import { expect, test } from 'vitest'
import { defaultHrPath } from './navigation'

test('routes CFO payroll readers directly to payroll',()=>expect(defaultHrPath(['payroll.read'])).toBe('payroll'))
test('routes HR employee readers to the employee directory',()=>expect(defaultHrPath(['employees.read','payroll.read'])).toBe('employees'))
