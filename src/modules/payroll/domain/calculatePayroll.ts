import {
  DEFAULT_PAYROLL_SETTINGS,
  type PayrollSettings,
  type TaxBand,
} from './taxTables'

export type TaxTreatment = 'local' | 'global' | 'contractor' | 'exempt'

export type PayrollInput = {
  grossSalary: number
  taxTreatment: TaxTreatment
  percentOfMonthWorked?: number
  overtimeHours?: number
  allowances?: number
  salaryAdvanceDeduction?: number
  otherDeductions?: number
  whtRatePercent?: number
  customOvertimeRate?: number | null
  nssfApplicable?: boolean
}

export type PayrollResult = {
  contractualGross: number
  proratedGross: number
  overtimeHours: number
  overtimeRate: number
  overtimePay: number
  allowances: number
  taxableGross: number
  paye: number
  nssfEmployee: number
  nssfEmployer: number
  wht: number
  salaryAdvanceDeduction: number
  otherDeductions: number
  totalDeductions: number
  netPay: number
  percentOfMonthWorked: number
  taxTreatment: TaxTreatment
}

type OvertimeOptions = {
  multiplier?: number
  standardMonthlyHours?: number
  customRate?: number | null
}

const percentage = (value: number) => value / 100
const taxTreatments: readonly TaxTreatment[] = ['local', 'global', 'contractor', 'exempt']

function assertFiniteNonNegative(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid payroll input: ${name} must be a finite non-negative number.`)
  }
}

function assertPercentage(name: string, value: number) {
  assertFiniteNonNegative(name, value)
  if (value > 100) throw new Error(`Invalid payroll input: ${name} must be between 0 and 100.`)
}

function validateTaxBands(bands: readonly TaxBand[]) {
  if (bands.length === 0) throw new Error('Invalid payroll input: at least one PAYE band is required.')
  if (bands[0].min !== 0) throw new Error('Invalid payroll input: PAYE bands must begin at zero.')

  bands.forEach((band, index) => {
    assertFiniteNonNegative(`PAYE band ${index + 1} minimum`, band.min)
    assertPercentage(`PAYE band ${index + 1} rate`, band.ratePercent)
    if (band.max != null) {
      assertFiniteNonNegative(`PAYE band ${index + 1} maximum`, band.max)
      if (band.max <= band.min) {
        throw new Error(`Invalid payroll input: PAYE band ${index + 1} maximum must exceed its minimum.`)
      }
    }
    if (index > 0 && bands[index - 1].max !== band.min) {
      throw new Error('Invalid payroll input: PAYE bands must be ordered and contiguous.')
    }
    if (index < bands.length - 1 && band.max == null) {
      throw new Error('Invalid payroll input: only the final PAYE band may be open-ended.')
    }
  })
  if (bands[bands.length - 1].max != null) {
    throw new Error('Invalid payroll input: the final PAYE band must be open-ended.')
  }
}

function validateInput(input: PayrollInput) {
  if (!taxTreatments.includes(input.taxTreatment)) {
    throw new Error('Invalid payroll input: tax treatment is not supported.')
  }
  if (input.nssfApplicable != null && typeof input.nssfApplicable !== 'boolean') {
    throw new Error('Invalid payroll input: NSSF applicability must be true or false.')
  }

  const values: Array<[string, number]> = [
    ['gross salary', input.grossSalary],
    ['percent of month worked', input.percentOfMonthWorked ?? 100],
    ['overtime hours', input.overtimeHours ?? 0],
    ['allowances', input.allowances ?? 0],
    ['salary advance deduction', input.salaryAdvanceDeduction ?? 0],
    ['other deductions', input.otherDeductions ?? 0],
    ['WHT rate', input.whtRatePercent ?? DEFAULT_PAYROLL_SETTINGS.defaultWhtRatePercent],
  ]

  if (input.customOvertimeRate != null) values.push(['custom overtime rate', input.customOvertimeRate])
  values.forEach(([name, value]) => assertFiniteNonNegative(name, value))

  const percentWorked = input.percentOfMonthWorked ?? 100
  if (percentWorked > 100) {
    throw new Error('Invalid payroll input: percent of month worked must be between 0 and 100.')
  }

  if ((input.whtRatePercent ?? DEFAULT_PAYROLL_SETTINGS.defaultWhtRatePercent) > 100) {
    throw new Error('Invalid payroll input: WHT rate must be between 0 and 100.')
  }
}

function validateSettings(settings: PayrollSettings) {
  validateTaxBands(settings.payeBands)
  assertPercentage('NSSF employee rate', settings.nssfEmployeeRatePercent)
  assertPercentage('NSSF employer rate', settings.nssfEmployerRatePercent)
  assertFiniteNonNegative('overtime multiplier', settings.overtimeMultiplier)
  assertFiniteNonNegative('standard monthly hours', settings.standardMonthlyHours)
  assertPercentage('default WHT rate', settings.defaultWhtRatePercent)
  assertPercentage('PAYE surcharge rate', settings.surchargeRatePercent)
  if (settings.surchargeThreshold != null) {
    assertFiniteNonNegative('PAYE surcharge threshold', settings.surchargeThreshold)
  }
  if (settings.standardMonthlyHours === 0) {
    throw new Error('Invalid payroll input: standard monthly hours must be greater than zero.')
  }
}

export function calculatePaye(
  taxableGross: number,
  bands: readonly TaxBand[] = DEFAULT_PAYROLL_SETTINGS.payeBands,
  surchargeThreshold: number | null = DEFAULT_PAYROLL_SETTINGS.surchargeThreshold,
  surchargeRatePercent = DEFAULT_PAYROLL_SETTINGS.surchargeRatePercent,
) {
  assertFiniteNonNegative('taxable gross', taxableGross)
  validateTaxBands(bands)
  if (surchargeThreshold != null) assertFiniteNonNegative('PAYE surcharge threshold', surchargeThreshold)
  assertPercentage('PAYE surcharge rate', surchargeRatePercent)

  let tax = 0
  for (const band of bands) {
    if (taxableGross <= band.min) break
    const upper = band.max == null ? taxableGross : Math.min(taxableGross, band.max)
    tax += (upper - band.min) * percentage(band.ratePercent)
  }

  if (surchargeThreshold != null && taxableGross > surchargeThreshold) {
    tax += (taxableGross - surchargeThreshold) * percentage(surchargeRatePercent)
  }

  return Math.round(tax)
}

export function calculateNssf(gross: number, employeeRatePercent = 5, employerRatePercent = 10) {
  assertFiniteNonNegative('NSSF gross', gross)
  assertPercentage('NSSF employee rate', employeeRatePercent)
  assertPercentage('NSSF employer rate', employerRatePercent)
  const employee = Math.round(gross * percentage(employeeRatePercent))
  const employer = Math.round(gross * percentage(employerRatePercent))
  return { employee, employer, total: employee + employer }
}

export function calculateOvertime(gross: number, hours: number, options: OvertimeOptions = {}) {
  assertFiniteNonNegative('overtime gross', gross)
  assertFiniteNonNegative('overtime hours', hours)
  if (hours === 0) return { hourlyRate: 0, overtimeRate: 0, overtimePay: 0 }

  if (options.customRate != null) {
    assertFiniteNonNegative('custom overtime rate', options.customRate)
    const overtimeRate = Math.round(options.customRate)
    return { hourlyRate: 0, overtimeRate, overtimePay: Math.round(overtimeRate * hours) }
  }

  const standardMonthlyHours = options.standardMonthlyHours ?? DEFAULT_PAYROLL_SETTINGS.standardMonthlyHours
  const multiplier = options.multiplier ?? DEFAULT_PAYROLL_SETTINGS.overtimeMultiplier
  assertFiniteNonNegative('standard monthly hours', standardMonthlyHours)
  assertFiniteNonNegative('overtime multiplier', multiplier)
  if (standardMonthlyHours === 0) {
    throw new Error('Invalid payroll input: standard monthly hours must be greater than zero.')
  }

  const hourlyRate = Math.round(gross / standardMonthlyHours)
  const overtimeRate = Math.round(hourlyRate * multiplier)
  return { hourlyRate, overtimeRate, overtimePay: Math.round(overtimeRate * hours) }
}

export function calculatePayroll(
  input: PayrollInput,
  settings: PayrollSettings = DEFAULT_PAYROLL_SETTINGS,
): PayrollResult {
  validateInput(input)
  validateSettings(settings)

  const contractualGross = Math.round(input.grossSalary)
  const percentOfMonthWorked = input.percentOfMonthWorked ?? 100
  const proratedGross = Math.round(input.grossSalary * percentage(percentOfMonthWorked))
  const overtimeHours = input.overtimeHours ?? 0
  const allowances = Math.round(input.allowances ?? 0)
  const salaryAdvanceDeduction = Math.round(input.salaryAdvanceDeduction ?? 0)
  const otherDeductions = Math.round(input.otherDeductions ?? 0)
  const overtime = calculateOvertime(proratedGross, overtimeHours, {
    multiplier: settings.overtimeMultiplier,
    standardMonthlyHours: settings.standardMonthlyHours,
    customRate: input.customOvertimeRate,
  })
  const taxableGross = proratedGross + overtime.overtimePay + allowances

  let paye = 0
  let nssfEmployee = 0
  let nssfEmployer = 0
  let wht = 0

  if (input.taxTreatment === 'contractor') {
    const whtRate = input.whtRatePercent ?? settings.defaultWhtRatePercent
    wht = Math.round(proratedGross * percentage(whtRate))
  } else if (input.taxTreatment === 'local' || input.taxTreatment === 'global') {
    paye = calculatePaye(
      taxableGross,
      settings.payeBands,
      settings.surchargeThreshold,
      settings.surchargeRatePercent,
    )
    const nssfApplicable = input.nssfApplicable ?? input.taxTreatment === 'local'
    if (nssfApplicable) {
      const nssf = calculateNssf(
        taxableGross,
        settings.nssfEmployeeRatePercent,
        settings.nssfEmployerRatePercent,
      )
      nssfEmployee = nssf.employee
      nssfEmployer = nssf.employer
    }
  }

  const totalDeductions = paye + nssfEmployee + wht + salaryAdvanceDeduction + otherDeductions

  return {
    contractualGross,
    proratedGross,
    overtimeHours,
    overtimeRate: overtime.overtimeRate,
    overtimePay: overtime.overtimePay,
    allowances,
    taxableGross,
    paye,
    nssfEmployee,
    nssfEmployer,
    wht,
    salaryAdvanceDeduction,
    otherDeductions,
    totalDeductions,
    netPay: taxableGross - totalDeductions,
    percentOfMonthWorked,
    taxTreatment: input.taxTreatment,
  }
}
