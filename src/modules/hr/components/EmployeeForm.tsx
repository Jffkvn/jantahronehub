import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Button } from '../../../components/ui/Button'
import { FormError } from '../../../components/ui/FormError'
import { Input } from '../../../components/ui/Input'
import { employeeFormSchema, type EmployeeFormValues } from '../schemas/employee'

const defaults: EmployeeFormValues = {
  employeeNumber: '', legalName: '', preferredName: '', companyEmail: '', workPhone: '',
  startDate: '', employmentType: 'full_time', contractType: 'permanent',
}

export function EmployeeForm({ initialValues, onSubmit, submitting = false, profileOnly = false }: {
  initialValues?: Partial<EmployeeFormValues>
  onSubmit: (values: EmployeeFormValues) => Promise<void>
  submitting?: boolean
  profileOnly?: boolean
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: { ...defaults, ...initialValues },
  })

  return <form className="oh-employee-form" onSubmit={handleSubmit(onSubmit)}>
    <div className="oh-form-grid">
      <Input label="Employee number" required error={errors.employeeNumber?.message} {...register('employeeNumber')} />
      <Input label="Legal name" required error={errors.legalName?.message} {...register('legalName')} />
      <Input label="Preferred name" error={errors.preferredName?.message} {...register('preferredName')} />
      <Input label="Company email" type="email" error={errors.companyEmail?.message} {...register('companyEmail')} />
      <Input label="Work phone" error={errors.workPhone?.message} {...register('workPhone')} />
      {profileOnly ? null : <><Input label="Start date" type="date" required error={errors.startDate?.message} {...register('startDate')} /><label className="oh-field"><span className="oh-field__label">Employment type</span><select className="oh-input" {...register('employmentType')}><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="casual">Casual</option><option value="intern">Intern</option><option value="contractor">Contractor</option></select></label><label className="oh-field"><span className="oh-field__label">Contract type</span><select className="oh-input" {...register('contractType')}><option value="permanent">Permanent</option><option value="fixed_term">Fixed term</option><option value="casual">Casual</option><option value="internship">Internship</option><option value="consultancy">Consultancy</option></select></label></>}
    </div>
    {errors.root?.message ? <FormError>{errors.root.message}</FormError> : null}
    <div className="oh-form-actions"><Button type="submit" loading={submitting}>Save employee</Button></div>
  </form>
}
