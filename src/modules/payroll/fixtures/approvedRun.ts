import type { PayrollRun } from '../types'

export const approvedRun: PayrollRun = {
  id:'run-1', periodId:'period-1', periodStart:'2026-06-01', periodEnd:'2026-06-30', periodLabel:'June 2026', runNumber:1, runType:'regular', sourceRunId:null, status:'approved', reason:null,
  totalGross:3000000,totalPaye:400000,totalNssfEmployee:100000,totalNssfEmployer:200000,totalWht:60000,totalDeductions:560000,totalNet:2440000,approvedAt:'2026-06-30T10:00:00Z',payment:null,
  items:[
    {id:'i1',employeeId:'e1',employeeNumber:'EGY-001',employeeName:'Amina Nsubuga',taxTreatment:'local',nssfApplicable:true,percentOfMonthWorked:100,contractualGross:2000000,proratedGross:2000000,overtimeHours:0,overtimeRate:0,overtimePay:0,allowances:0,taxableGross:2000000,paye:400000,nssfEmployee:100000,nssfEmployer:200000,wht:0,salaryAdvanceDeduction:0,otherDeductions:0,totalDeductions:500000,netPay:1500000,tinNumber:'TIN1',nssfNumber:'NSSF1',paymentMethod:'bank',bankName:'Stanbic',accountNumber:'12345',sortCode:'SBICUGKX',mobileMoneyNumber:'0772111111',lineItems:[]},
    {id:'i2',employeeId:'e2',employeeNumber:'EGY-002',employeeName:'Dora, Atim',taxTreatment:'contractor',nssfApplicable:false,percentOfMonthWorked:100,contractualGross:1000000,proratedGross:1000000,overtimeHours:0,overtimeRate:0,overtimePay:0,allowances:0,taxableGross:1000000,paye:0,nssfEmployee:0,nssfEmployer:0,wht:60000,salaryAdvanceDeduction:0,otherDeductions:0,totalDeductions:60000,netPay:940000,tinNumber:'TIN2',nssfNumber:null,paymentMethod:'mobile_money',bankName:null,accountNumber:null,sortCode:null,mobileMoneyNumber:'0772000000',lineItems:[]},
  ],
}
