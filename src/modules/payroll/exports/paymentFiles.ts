import type { PayrollRun } from '../types'

const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
const approved = (run: PayrollRun) => { if (run.status !== 'approved') throw new Error('Payroll must be approved before export') }
const reference = (run: PayrollRun, employeeNumber: string) => `SAL-${run.periodStart.slice(0,7)}-${employeeNumber}`

export function bankPaymentCsv(run: PayrollRun) {
  approved(run)
  const items = run.items.filter((item) => item.paymentMethod === 'bank')
  const rows = items.map((item, index) => [index + 1, quote(item.employeeName), quote(item.bankName), quote(item.sortCode), quote(item.accountNumber), Math.round(item.netPay), quote(reference(run,item.employeeNumber)), 'UGX'].join(','))
  const total = items.reduce((sum,item) => sum + Math.round(item.netPay),0)
  return ['No,Employee Name,Bank Name,Branch/Sort Code,Account Number,Amount (UGX),Reference,Currency',...rows,`,,,,,${total},,`].join('\n')
}
export function mtnBulkPayCsv(run: PayrollRun) {
  approved(run)
  return ['Phone Number,Amount,Currency,Reference',...run.items.filter((item) => item.paymentMethod === 'mobile_money').map((item) => `${item.mobileMoneyNumber},${Math.round(item.netPay)},UGX,${reference(run,item.employeeNumber)}`)].join('\n')
}
export function nssfCsv(run: PayrollRun) {
  approved(run); const items = run.items.filter((item) => item.nssfApplicable)
  const rows = items.map((item) => [quote(item.employeeName),quote(item.nssfNumber),Math.round(item.taxableGross),Math.round(item.nssfEmployee),Math.round(item.nssfEmployer),Math.round(item.nssfEmployee+item.nssfEmployer)].join(','))
  const employee = items.reduce((s,i)=>s+Math.round(i.nssfEmployee),0), employer=items.reduce((s,i)=>s+Math.round(i.nssfEmployer),0)
  return ['Employee Name,NSSF Number,Gross Salary,Employee NSSF (5%),Employer NSSF (10%),Total NSSF',...rows,`TOTAL,,,${employee},${employer},${employee+employer}`].join('\n')
}
export function payeCsv(run: PayrollRun) {
  approved(run); const items=run.items.filter((item)=>item.taxTreatment==='local'||item.taxTreatment==='global')
  return ['Employee Name,TIN Number,Employee Type,Gross Salary,PAYE Tax',...items.map((i)=>[quote(i.employeeName),quote(i.tinNumber),quote(i.taxTreatment),Math.round(i.taxableGross),Math.round(i.paye)].join(',')),`TOTAL,,,,${items.reduce((s,i)=>s+Math.round(i.paye),0)}`].join('\n')
}
export function whtCsv(run: PayrollRun) {
  approved(run); const items=run.items.filter((item)=>item.taxTreatment==='contractor'&&item.wht>0)
  return ['Employee Name,TIN Number,Gross Salary,WHT Amount',...items.map((i)=>[quote(i.employeeName),quote(i.tinNumber),Math.round(i.taxableGross),Math.round(i.wht)].join(',')),`TOTAL,,,${items.reduce((s,i)=>s+Math.round(i.wht),0)}`].join('\n')
}
export function downloadText(content:string, filename:string, mime='text/csv;charset=utf-8') { const url=URL.createObjectURL(new Blob([content],{type:mime})); const anchor=document.createElement('a'); anchor.href=url; anchor.download=filename; anchor.click(); URL.revokeObjectURL(url) }
