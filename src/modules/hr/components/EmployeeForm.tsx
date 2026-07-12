import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, CreditCard, Landmark, UserRound } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'

import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { employeeFormSchema, type EmployeeFormValues } from '../schemas/employee'

export interface EmployeeSetupOption { id: string; name: string; departmentId?: string | null }
const defaults: EmployeeFormValues = {
  fullName: '', nationalId: '', companyEmail: '', personalEmail: '', phone: '', gender: '', dateOfBirth: '',
  departmentId: '', jobTitleId: '', employmentType: 'full_time', startDate: '', contractType: 'permanent', contractEndDate: '', probationEndDate: '', probationStatus: 'not_applicable',
  grossSalary: '', currency: 'UGX', customOvertimeRate: '', paymentMethod: 'cash', mobileMoneyNumber: '', bankName: '', accountNumber: '', sortCode: '',
  employeeNumber: '', tinNumber: '', nssfNumber: '', employeeTaxType: 'local', pctMonthWorked: '100', whtRate: '6',
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <fieldset className="oh-form-section"><legend>{icon}<span>{title}</span></legend><div className="oh-form-grid">{children}</div></fieldset>
}

export function EmployeeForm({ initialValues, onSubmit, submitting = false, departments = [], jobTitles = [] }: {
  initialValues?: Partial<EmployeeFormValues>; onSubmit: (values: EmployeeFormValues) => Promise<void>; submitting?: boolean;
  departments?: EmployeeSetupOption[]; jobTitles?: EmployeeSetupOption[]
}) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<EmployeeFormValues>({ resolver: zodResolver(employeeFormSchema), defaultValues: { ...defaults, ...initialValues } })
  const taxType = useWatch({ control, name: 'employeeTaxType' })
  const paymentMethod = useWatch({ control, name: 'paymentMethod' })
  return <form className="oh-employee-form" onSubmit={handleSubmit(onSubmit)}>
    <Section icon={<UserRound size={17} />} title="Personal information">
      <Input label="Full name" required error={errors.fullName?.message} {...register('fullName')} />
      <Input label="NIN / Passport number" error={errors.nationalId?.message} {...register('nationalId')} />
      <Input label="Company email" type="email" error={errors.companyEmail?.message} {...register('companyEmail')} />
      <Input label="Personal email" type="email" error={errors.personalEmail?.message} {...register('personalEmail')} />
      <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
      <label className="oh-field"><span className="oh-field__label">Gender</span><select className="oh-input" {...register('gender')}><option value="">Select</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
      <Input label="Date of birth" type="date" error={errors.dateOfBirth?.message} {...register('dateOfBirth')} />
    </Section>
    <Section icon={<Building2 size={17} />} title="Employment details">
      <label className="oh-field"><span className="oh-field__label">Position / Job title</span><select className="oh-input" {...register('jobTitleId')}><option value="">Not assigned</option>{jobTitles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="oh-field"><span className="oh-field__label">Department</span><select className="oh-input" {...register('departmentId')}><option value="">Not assigned</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="oh-field"><span className="oh-field__label">Employment type</span><select className="oh-input" {...register('employmentType')}><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="casual">Casual / Daily</option><option value="intern">Intern</option><option value="contractor">Contractor</option></select></label>
      <Input label="Start date" type="date" required error={errors.startDate?.message} {...register('startDate')} />
    </Section>
    <Section icon={<Building2 size={17} />} title="Contract & probation tracking">
      <label className="oh-field"><span className="oh-field__label">Contract type</span><select className="oh-input" {...register('contractType')}><option value="permanent">Permanent</option><option value="fixed_term">Fixed term / Project</option><option value="casual">Casual / Temp</option><option value="internship">Internship</option><option value="consultancy">Consultancy</option></select></label>
      <Input label="Contract end date" type="date" hint="Required for fixed-term contracts." error={errors.contractEndDate?.message} {...register('contractEndDate')} />
      <Input label="Probation end date" type="date" error={errors.probationEndDate?.message} {...register('probationEndDate')} />
      <label className="oh-field"><span className="oh-field__label">Probation status</span><select className="oh-input" {...register('probationStatus')}><option value="not_applicable">Not applicable</option><option value="on_probation">On probation</option><option value="passed">Passed</option><option value="extended">Extended</option><option value="failed">Failed</option></select></label>
    </Section>
    <Section icon={<CreditCard size={17} />} title="Salary & payment">
      <Input label="Gross monthly salary" inputMode="decimal" error={errors.grossSalary?.message} {...register('grossSalary')} />
      <label className="oh-field"><span className="oh-field__label">Currency</span><select className="oh-input" {...register('currency')}><option value="UGX">UGX — Ugandan Shilling</option></select></label>
      <Input label="Custom overtime rate (/hr)" inputMode="decimal" hint="Leave blank to use the standard payroll formula." error={errors.customOvertimeRate?.message} {...register('customOvertimeRate')} />
      <label className="oh-field"><span className="oh-field__label">Payment method</span><select className="oh-input" {...register('paymentMethod')}><option value="cash">Cash / manually arranged</option><option value="bank">Bank transfer</option><option value="mobile_money">Mobile money</option></select></label>
      <Input label="Mobile money number (MTN/Airtel)" required={paymentMethod === 'mobile_money'} error={errors.mobileMoneyNumber?.message} {...register('mobileMoneyNumber')} />
      <Input label="Bank name" required={paymentMethod === 'bank'} error={errors.bankName?.message} {...register('bankName')} /><Input label="Account number" required={paymentMethod === 'bank'} error={errors.accountNumber?.message} {...register('accountNumber')} /><Input label="Sort code (Bank branch)" {...register('sortCode')} />
    </Section>
    <Section icon={<Landmark size={17} />} title="Statutory & tax details">
      <Input label="Employee number (Company ID)" required error={errors.employeeNumber?.message} {...register('employeeNumber')} />
      <Input label="TIN number" {...register('tinNumber')} /><Input label="NSSF number" {...register('nssfNumber')} />
      <label className="oh-field"><span className="oh-field__label">Employee tax type</span><select className="oh-input" {...register('employeeTaxType')}><option value="local">Local — PAYE + NSSF</option><option value="global">Global / Expat — PAYE only</option><option value="contractor">Contractor — WHT only</option><option value="exempt">Tax exempt</option></select></label>
      {taxType === 'contractor' ? <Input label="WHT rate (%)" error={errors.whtRate?.message} {...register('whtRate')} /> : null}
      <Input label="% of month worked" hint="Used for pro-rata payroll." error={errors.pctMonthWorked?.message} {...register('pctMonthWorked')} />
    </Section>
    <div className="oh-form-actions"><Button type="submit" loading={submitting}>Save employee</Button></div>
  </form>
}
