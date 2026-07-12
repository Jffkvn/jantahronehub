export function defaultHrPath(permissionKeys: string[]) {
  if (permissionKeys.includes('employees.read')) return 'employees'
  if (permissionKeys.includes('payroll.read')) return 'payroll'
  return 'employees'
}
