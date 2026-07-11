export type TaxBand = {
  min: number
  max: number | null
  ratePercent: number
}

export type PayrollSettings = {
  payeBands: readonly TaxBand[]
  surchargeThreshold: number | null
  surchargeRatePercent: number
  nssfEmployeeRatePercent: number
  nssfEmployerRatePercent: number
  overtimeMultiplier: number
  standardMonthlyHours: number
  defaultWhtRatePercent: number
}

export const UGANDA_RESIDENT_PAYE_BANDS: readonly TaxBand[] = [
  { min: 0, max: 235_000, ratePercent: 0 },
  { min: 235_000, max: 335_000, ratePercent: 10 },
  { min: 335_000, max: 410_000, ratePercent: 20 },
  { min: 410_000, max: null, ratePercent: 30 },
]

// Official reference points used to verify these defaults:
// https://ura.go.ug/en/domestic-taxes/paye-rates/
// https://www.nssfug.org/about-us/membership/

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  payeBands: UGANDA_RESIDENT_PAYE_BANDS,
  surchargeThreshold: 10_000_000,
  surchargeRatePercent: 10,
  nssfEmployeeRatePercent: 5,
  nssfEmployerRatePercent: 10,
  overtimeMultiplier: 1.5,
  standardMonthlyHours: 173.33,
  defaultWhtRatePercent: 6,
}
