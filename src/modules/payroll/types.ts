export type PayrollRunType = 'regular' | 'supplemental' | 'correction' | 'historical'
export type PayrollStatus = 'draft' | 'approved'

export interface PayrollLineItem { id?: string; kind: 'allowance' | 'salary_advance' | 'deduction'; code: string; description: string; amount: number }
export interface PayrollItem {
  id: string; employeeId: string; employeeNumber: string; employeeName: string; taxTreatment: 'local' | 'global' | 'contractor' | 'exempt'; nssfApplicable: boolean;
  percentOfMonthWorked: number; contractualGross: number; proratedGross: number; overtimeHours: number; overtimeRate: number; overtimePay: number; allowances: number;
  taxableGross: number; paye: number; nssfEmployee: number; nssfEmployer: number; wht: number; salaryAdvanceDeduction: number; otherDeductions: number; totalDeductions: number; netPay: number;
  tinNumber: string | null; nssfNumber: string | null; paymentMethod: 'bank' | 'mobile_money' | 'cash'; bankName: string | null; accountNumber: string | null; sortCode: string | null; mobileMoneyNumber: string | null;
  lineItems: PayrollLineItem[]
}
export interface PayrollPayment { id: string; paidOn: string; amount: number; reference: string; method: 'bank' | 'mobile_money' | 'cash' | 'other'; proofPath: string | null; notes: string | null; recordedAt: string }
export interface PayrollRun {
  id: string; periodId: string; periodStart: string; periodEnd: string; periodLabel: string; runNumber: number; runType: PayrollRunType; sourceRunId: string | null; status: PayrollStatus; reason: string | null;
  totalGross: number; totalPaye: number; totalNssfEmployee: number; totalNssfEmployer: number; totalWht: number; totalDeductions: number; totalNet: number; approvedAt: string | null; items: PayrollItem[]; payment: PayrollPayment | null
}
export interface PayrollEmployee { id: string; employeeNumber: string; employeeName: string; defaultPercentWorked: number }
export interface PayrollDraftItem { employeeId: string; percentOfMonthWorked: number; overtimeHours: number; lineItems: PayrollLineItem[] }
