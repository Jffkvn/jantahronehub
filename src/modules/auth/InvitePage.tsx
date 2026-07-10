import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '../../components/ui/Button'
import { FormError } from '../../components/ui/FormError'
import { Input } from '../../components/ui/Input'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'

const passwordSchema = z.object({
  password: z.string().min(10, 'Use at least 10 characters.'),
  confirmPassword: z.string(),
}).refine((values) => values.password === values.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match.',
})
type PasswordValues = z.infer<typeof passwordSchema>

export function InvitePage() {
  const [params] = useSearchParams()
  const tokenHash = params.get('token_hash')
  const auth = useAuth()
  const { acceptInvite, setInitialPassword } = auth
  const navigate = useNavigate()
  const [accepted, setAccepted] = useState(false)
  const [inviteError, setInviteError] = useState(
    tokenHash ? '' : 'This invitation link is invalid or incomplete.',
  )
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
  })

  useEffect(() => {
    if (!tokenHash) return
    let active = true
    acceptInvite(tokenHash)
      .then(() => { if (active) setAccepted(true) })
      .catch(() => { if (active) setInviteError('This invitation link is invalid or has expired.') })
    return () => { active = false }
  }, [acceptInvite, tokenHash])

  return (
    <AuthLayout
      eyebrow="Invitation accepted"
      title="Create your password"
      description="Choose a private password to finish activating your OneHub account."
    >
      {inviteError ? <FormError>{inviteError}</FormError> : null}
      {accepted ? (
        <form className="oh-auth-form" onSubmit={handleSubmit(async ({ password }) => {
          setInviteError('')
          try {
            await setInitialPassword(password)
            navigate('/home', { replace: true })
          } catch {
            setInviteError('Your password could not be saved. Request a new invitation if this continues.')
          }
        })}>
          <Input label="New password" type="password" autoComplete="new-password" error={errors.password?.message} {...register('password')} />
          <Input label="Confirm password" type="password" autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
          <Button type="submit" loading={isSubmitting}>Activate account</Button>
        </form>
      ) : !inviteError ? <div className="oh-route-loading" role="status"><span /><p>Checking invitation…</p></div> : null}
    </AuthLayout>
  )
}
