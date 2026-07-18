export function defaultHrPath(permissionKeys: string[]) {
  if (permissionKeys.includes('employees.read')) return 'employees'
  if (permissionKeys.includes('staff_advances.manage')) return 'staff-advances'
  if (permissionKeys.includes('payroll.read')) return 'payroll'
  return 'employees'
}
