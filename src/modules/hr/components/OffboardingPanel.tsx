import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { offboardingSchema, type OffboardingValues } from '../schemas/employee'

export function OffboardingPanel({ onSubmit, submitting = false }: {
  onSubmit: (values: OffboardingValues) => Promise<void>
  submitting?: boolean
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<OffboardingValues>({
    resolver: zodResolver(offboardingSchema),
    defaultValues: { endDate: '', exitReason: '', exitNotes: '', finalPayStatus: 'pending' },
  })
  return <form className="oh-employee-form" onSubmit={handleSubmit(onSubmit)}>
    <Input label="Last working day" type="date" required error={errors.endDate?.message} {...register('endDate')} />
    <Input label="Exit reason" required error={errors.exitReason?.message} {...register('exitReason')} />
    <label className="oh-field"><span className="oh-field__label">Clearance notes</span><textarea className="oh-input oh-textarea" {...register('exitNotes')} /></label>
    <label className="oh-field"><span className="oh-field__label">Final pay status</span><select className="oh-input" {...register('finalPayStatus')}><option value="not_applicable">Not applicable</option><option value="pending">Pending</option><option value="prepared">Prepared</option><option value="paid">Paid</option></select></label>
    <div className="oh-form-actions"><Button type="submit" loading={submitting}>Confirm exit</Button></div>
  </form>
}
