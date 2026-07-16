import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { payGradeInputSchema, type PayGradeInput } from '../schemas/setup'

type PayGradeFormInput = z.input<typeof payGradeInputSchema>
type PayGradeFormOutput = z.output<typeof payGradeInputSchema>

export function PayGradeForm({
  initialValues,
  submitting,
  onCancel,
  onSubmit,
}: {
  initialValues?: Partial<PayGradeInput>
  submitting?: boolean
  onCancel: () => void
  onSubmit: (values: PayGradeFormOutput) => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PayGradeFormInput, unknown, PayGradeFormOutput>({
    resolver: zodResolver(payGradeInputSchema),
    defaultValues: {
      id: initialValues?.id ?? null,
      code: initialValues?.code ?? '',
      name: initialValues?.name ?? '',
      currencyCode: initialValues?.currencyCode ?? 'UGX',
      minimumGross: initialValues?.minimumGross ?? '',
      maximumGross: initialValues?.maximumGross ?? '',
      description: initialValues?.description ?? '',
      reason: '',
    },
  })

  return (
    <form className="oh-setup-form" onSubmit={handleSubmit(onSubmit)}>
      <div className="oh-form-grid">
        <Input label="Code" required error={errors.code?.message} {...register('code')} />
        <Input label="Name" required error={errors.name?.message} {...register('name')} />
        <Input label="Currency" required error={errors.currencyCode?.message} {...register('currencyCode')} />
        <span aria-hidden="true" />
        <Input label="Minimum gross" inputMode="decimal" error={errors.minimumGross?.message} {...register('minimumGross')} />
        <Input label="Maximum gross" inputMode="decimal" error={errors.maximumGross?.message} {...register('maximumGross')} />
      </div>
      <label className="oh-field">
        <span className="oh-field__label">Description</span>
        <textarea className="oh-input oh-textarea" {...register('description')} />
      </label>
      <Input
        label="Reason for change"
        required
        hint="This reason is saved in the audit trail."
        error={errors.reason?.message}
        {...register('reason')}
      />
      <div className="oh-form-actions">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={submitting}>Save pay grade</Button>
      </div>
    </form>
  )
}
