export const employeeTemplateColumns = [
  { key: 'full_name', label: 'Full Name *' }, { key: 'national_id', label: 'NIN / Passport Number' },
  { key: 'company_email', label: 'Company Email' }, { key: 'personal_email', label: 'Personal Email' }, { key: 'phone', label: 'Phone' },
  { key: 'gender', label: 'Gender' }, { key: 'date_of_birth', label: 'Date of Birth' }, { key: 'department', label: 'Department' }, { key: 'job_title', label: 'Position / Job Title' },
  { key: 'employment_type', label: 'Employment Type' }, { key: 'start_date', label: 'Start Date *' }, { key: 'contract_type', label: 'Contract Type' }, { key: 'contract_end_date', label: 'Contract End Date' },
  { key: 'probation_end_date', label: 'Probation End Date' }, { key: 'probation_status', label: 'Probation Status' }, { key: 'gross_salary', label: 'Gross Monthly Salary' },
  { key: 'currency', label: 'Currency' }, { key: 'custom_overtime_rate', label: 'Custom Overtime Rate / Hr' }, { key: 'payment_method', label: 'Payment Method *' }, { key: 'mobile_money_number', label: 'Mobile Money Number' },
  { key: 'bank_name', label: 'Bank Name' }, { key: 'account_number', label: 'Account Number' }, { key: 'sort_code', label: 'Sort Code' },
  { key: 'employee_number', label: 'Employee Number / Company ID *' }, { key: 'tin_number', label: 'TIN Number' }, { key: 'nssf_number', label: 'NSSF Number' },
  { key: 'employee_tax_type', label: 'Employee Tax Type' }, { key: 'pct_month_worked', label: '% of Month Worked' }, { key: 'wht_rate', label: 'WHT Rate %' },
] as const

export async function downloadEmployeeTemplate() {
  const XLSX = await import('@e965/xlsx')
  const workbook = XLSX.utils.book_new()
  const headings = employeeTemplateColumns.map((column) => column.label)
  const example = ['Sarah Nakato', 'CM91010002TQMZ', 'sarah@company.com', 'sarah@gmail.com', '+256700000000', 'female', '1990-01-31', 'Operations', 'Store Manager', 'full_time', '2026-07-11', 'permanent', '', '', 'not_applicable', 1500000, 'UGX', '', 'bank', '0772000000', 'Stanbic Bank', '9030012345678', 'EQBLUGKA', 'AC002', '1036914121', '1997050295506', 'local', 100, 6]
  const template = XLSX.utils.aoa_to_sheet([headings])
  template['!cols'] = employeeTemplateColumns.map((column) => ({ wch: Math.max(16, column.label.length + 2) }))
  const instructions = XLSX.utils.aoa_to_sheet([
    ['Egypro OneHub Employee Upload'], ['Use the Employee Upload sheet. Keep column names unchanged.'],
    ['Required', 'Full Name, Start Date, Employee Number / Company ID'],
    ['Dates', 'Use YYYY-MM-DD'], ['Employment Type', 'full_time, part_time, casual, intern, contractor'],
    ['Contract Type', 'permanent, fixed_term, casual, internship, consultancy'], ['Payment Method', 'bank, mobile_money, cash. Bank requires bank name and account number; mobile_money requires a phone number.'], ['Employee Tax Type', 'local, global, contractor, exempt'],
    ['Important', 'Removing an employee from this workbook never deactivates them. Use OneHub offboarding instead.'],
  ])
  instructions['!cols'] = [{ wch: 24 }, { wch: 90 }]
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headings, example]), 'Example')
  XLSX.utils.book_append_sheet(workbook, template, 'Employee Upload')
  XLSX.writeFile(workbook, 'OneHub_Employee_Upload_Template.xlsx', { compression: true })
}

export async function downloadEmployeeErrorReport(errors: Array<{ rowNumber: number; field: string; message: string }>) {
  const XLSX = await import('@e965/xlsx'); const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(errors.map((error) => ({ 'Spreadsheet Row': error.rowNumber || 'File', Field: error.field, Problem: error.message })))
  sheet['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 70 }]; XLSX.utils.book_append_sheet(workbook, sheet, 'Corrections')
  XLSX.writeFile(workbook, 'OneHub_Employee_Import_Corrections.xlsx', { compression: true })
}
