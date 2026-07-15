import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '../../../components/ui/Button'
import { FormError } from '../../../components/ui/FormError'
import { Input } from '../../../components/ui/Input'
import {
  roleKeySchema,
  type EmployeeCandidate,
  type RoleKey,
  type RoleOption,
} from '../api/users'

const formSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name is required.')
    .max(160, 'Display name cannot exceed 160 characters.'),
  roleKeys: z
    .array(roleKeySchema)
    .min(1, 'Select at least one role.')
    .transform((roleKeys) => [...new Set(roleKeys)]),
  employeeId: z
    .string()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.string().uuid().nullable()),
  reason: z
    .string()
    .trim()
    .min(3, 'Reason must contain at least 3 characters.')
    .max(500, 'Reason cannot exceed 500 characters.'),
})

type UserAccessFormInput = z.input<typeof formSchema>
export type UserAccessFormValues = z.output<typeof formSchema>

export function UserAccessForm({
  mode,
  roles,
  employees,
  initialValues,
  submitting = false,
  submitError,
  onSubmit,
  onCancel,
}: {
  mode: 'connect' | 'edit'
  roles: RoleOption[]
  employees: EmployeeCandidate[]
  initialValues?: {
    email?: string
    displayName?: string
    roleKeys?: RoleKey[]
    employeeId?: string | null
  }
  submitting?: boolean
  submitError?: string
  onSubmit: (values: UserAccessFormValues) => Promise<void> | void
  onCancel?: () => void
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UserAccessFormInput, unknown, UserAccessFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: initialValues?.email ?? '',
      displayName: initialValues?.displayName ?? '',
      roleKeys: initialValues?.roleKeys ?? [],
      employeeId: initialValues?.employeeId ?? '',
      reason: '',
    },
  })

  const selectableEmployees = employees.filter(
    (employee) =>
      employee.available || employee.id === initialValues?.employeeId,
  )

  return (
    <form
      className="oh-user-access-form"
      noValidate
      onSubmit={handleSubmit(async (values) => onSubmit(values))}
    >
      <div className="oh-form-grid">
        {mode === 'connect' ? (
          <Input
            label="Auth user email"
            type="email"
            autoComplete="off"
            required
            hint="Must exactly match an existing Supabase Auth user."
            error={errors.email?.message}
            {...register('email')}
          />
        ) : null}
        <Input
          label="Display name"
          required
          error={errors.displayName?.message}
          {...register('displayName')}
        />
        <label className="oh-field">
          <span className="oh-field__label">Employee link</span>
          <select className="oh-input" {...register('employeeId')}>
            <option value="">No employee link</option>
            {selectableEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.legalName} · {employee.employeeNumber}
              </option>
            ))}
          </select>
          <span className="oh-field__hint">
            Support and test accounts may remain separate from employee records.
          </span>
          {errors.employeeId?.message ? (
            <FormError>{errors.employeeId.message}</FormError>
          ) : null}
        </label>
      </div>

      <fieldset className="oh-role-picker">
        <legend>Access roles</legend>
        <p>Select every role this account should hold.</p>
        <div className="oh-role-picker__grid">
          {roles.map((role) => (
            <label key={role.id} className="oh-role-option">
              <input
                type="checkbox"
                value={role.key}
                {...register('roleKeys')}
              />
              <span>
                <strong>{role.name}</strong>
                <small>{role.description}</small>
              </span>
            </label>
          ))}
        </div>
        {errors.roleKeys?.message ? (
          <FormError>{errors.roleKeys.message}</FormError>
        ) : null}
      </fieldset>

      <label className="oh-field">
        <span className="oh-field__label">
          Reason for access change <span aria-hidden="true">*</span>
        </span>
        <textarea
          className="oh-input oh-textarea"
          rows={3}
          maxLength={500}
          placeholder="Explain who requested this access and why."
          aria-invalid={errors.reason ? true : undefined}
          {...register('reason')}
        />
        <span className="oh-field__hint">
          This reason is kept in the permanent access audit trail.
        </span>
        {errors.reason?.message ? (
          <FormError>{errors.reason.message}</FormError>
        ) : null}
      </label>

      {submitError ? <FormError>{submitError}</FormError> : null}

      <div className="oh-form-actions">
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={submitting}>
          {mode === 'connect' ? 'Connect account' : 'Save access changes'}
        </Button>
      </div>
    </form>
  )
}
