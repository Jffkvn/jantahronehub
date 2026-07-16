import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import {
  departmentInputSchema,
  type DepartmentInput,
} from '../schemas/setup'

type DepartmentFormInput = z.input<typeof departmentInputSchema>
type DepartmentFormOutput = z.output<typeof departmentInputSchema>

export function DepartmentForm({
  initialValues,
  submitting,
  onCancel,
  onSubmit,
}: {
  initialValues?: Partial<DepartmentInput>
  submitting?: boolean
  onCancel: () => void
  onSubmit: (values: DepartmentFormOutput) => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DepartmentFormInput, unknown, DepartmentFormOutput>({
    resolver: zodResolver(departmentInputSchema),
    defaultValues: {
      id: initialValues?.id ?? null,
      code: initialValues?.code ?? '',
      name: initialValues?.name ?? '',
      description: initialValues?.description ?? '',
      reason: '',
    },
  })

  return (
    <form className="oh-setup-form" onSubmit={handleSubmit(onSubmit)}>
      <div className="oh-form-grid">
        <Input label="Code" required error={errors.code?.message} {...register('code')} />
        <Input label="Name" required error={errors.name?.message} {...register('name')} />
      </div>
      <label className="oh-field">
        <span className="oh-field__label">Description</span>
        <textarea className="oh-input oh-textarea" {...register('description')} />
        {errors.description?.message ? <span className="oh-form-error">{errors.description.message}</span> : null}
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
        <Button type="submit" loading={submitting}>Save department</Button>
      </div>
    </form>
  )
}
