import type { PayrollDraftItem, PayrollEmployee } from '../types'

export function buildAmendmentDraftItems(
  employees: PayrollEmployee[],
  selectedEmployeeIds: string[],
  runType: 'supplemental' | 'correction',
): PayrollDraftItem[] {
  return employees
    .filter((employee) => selectedEmployeeIds.includes(employee.id))
    .map((employee) => ({
      employeeId: employee.id,
      // Corrections start at zero so creating one cannot duplicate a full salary.
      percentOfMonthWorked: runType === 'correction' ? 0 : employee.defaultPercentWorked,
      overtimeHours: 0,
      lineItems: [],
    }))
}
