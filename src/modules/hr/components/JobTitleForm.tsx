import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import type { DepartmentSetupRecord } from '../api/setup'
import { jobTitleInputSchema, type JobTitleInput } from '../schemas/setup'

type JobTitleFormInput = z.input<typeof jobTitleInputSchema>
type JobTitleFormOutput = z.output<typeof jobTitleInputSchema>

export function JobTitleForm({
  departments,
  initialValues,
  submitting,
  onCancel,
  onSubmit,
}: {
  departments: DepartmentSetupRecord[]
  initialValues?: Partial<JobTitleInput>
  submitting?: boolean
  onCancel: () => void
  onSubmit: (values: JobTitleFormOutput) => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<JobTitleFormInput, unknown, JobTitleFormOutput>({
    resolver: zodResolver(jobTitleInputSchema),
    defaultValues: {
      id: initialValues?.id ?? null,
      departmentId: initialValues?.departmentId ?? null,
      code: initialValues?.code ?? '',
      name: initialValues?.name ?? '',
      description: initialValues?.description ?? '',
      reason: '',
    },
  })

  return (
    <form className="oh-setup-form" onSubmit={handleSubmit(onSubmit)}>
      <label className="oh-field">
        <span className="oh-field__label">Department</span>
        <select className="oh-input" {...register('departmentId', { setValueAs: (value) => value || null })}>
          <option value="">Company-wide title</option>
          {departments.filter((department) => !department.archivedAt).map((department) => (
            <option key={department.id} value={department.id}>{department.name}</option>
          ))}
        </select>
        <span className="oh-field__hint">Company-wide titles remain available in every department.</span>
      </label>
      <div className="oh-form-grid">
        <Input label="Code" required error={errors.code?.message} {...register('code')} />
        <Input label="Name" required error={errors.name?.message} {...register('name')} />
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
        <Button type="submit" loading={submitting}>Save job title</Button>
      </div>
    </form>
  )
}
