import { describe, expect, it } from 'vitest'
import { payrollReferenceCases } from '../fixtures/referenceCases'
import {
  calculateNssf,
  calculateOvertime,
  calculatePaye,
  calculatePayroll,
} from './calculatePayroll'

describe('Uganda payroll calculation', () => {
  it.each(payrollReferenceCases)('$name', ({ input, expected }) => {
    expect(calculatePayroll(input)).toEqual(expected)
  })

  it.each([
    [0, 0],
    [235_000, 0],
    [335_000, 10_000],
    [410_000, 25_000],
    [10_000_000, 2_902_000],
    [12_000_000, 3_702_000],
  ])('calculates resident PAYE for UGX %i as UGX %i', (gross, expected) => {
    expect(calculatePaye(gross)).toBe(expected)
  })

  it('uses configurable NSSF contribution rates', () => {
    expect(calculateNssf(2_000_000, 4, 8)).toEqual({ employee: 80_000, employer: 160_000, total: 240_000 })
  })

  it('uses a custom overtime rate when one is configured', () => {
    expect(calculateOvertime(1_000_000, 7.5, { customRate: 20_000 })).toEqual({
      hourlyRate: 0,
      overtimeRate: 20_000,
      overtimePay: 150_000,
    })
  })

  it('allows statutory and overtime settings to be configured per payroll run', () => {
    const result = calculatePayroll(
      { grossSalary: 1_000_000, taxTreatment: 'local', overtimeHours: 2 },
      {
        payeBands: [{ min: 0, max: null, ratePercent: 10 }],
        surchargeThreshold: null,
        surchargeRatePercent: 0,
        nssfEmployeeRatePercent: 4,
        nssfEmployerRatePercent: 8,
        overtimeMultiplier: 2,
        standardMonthlyHours: 100,
        defaultWhtRatePercent: 6,
      },
    )

    expect(result).toMatchObject({
      overtimeRate: 20_000,
      overtimePay: 40_000,
      taxableGross: 1_040_000,
      paye: 104_000,
      nssfEmployee: 41_600,
      nssfEmployer: 83_200,
      netPay: 894_400,
    })
  })

  it.each([
    [{ grossSalary: -1, taxTreatment: 'local' }],
    [{ grossSalary: Number.NaN, taxTreatment: 'local' }],
    [{ grossSalary: 1_000_000, taxTreatment: 'unknown' }],
    [{ grossSalary: 1_000_000, taxTreatment: 'local', percentOfMonthWorked: 101 }],
    [{ grossSalary: 1_000_000, taxTreatment: 'local', otherDeductions: -1 }],
  ])('rejects invalid payroll input %#', (input) => {
    expect(() => calculatePayroll(input as never)).toThrow(/invalid payroll input/i)
  })

  it('rejects invalid statutory settings before calculating payroll', () => {
    expect(() => calculateNssf(1_000_000, -5, 10)).toThrow(/invalid payroll input/i)
    expect(() => calculatePaye(1_000_000, [{ min: 0, max: null, ratePercent: -10 }])).toThrow(
      /invalid payroll input/i,
    )
    expect(() =>
      calculatePaye(1_000_000, [
        { min: 0, max: 410_000, ratePercent: 0 },
        { min: 335_000, max: null, ratePercent: 30 },
      ]),
    ).toThrow(/invalid payroll input/i)
  })
})
