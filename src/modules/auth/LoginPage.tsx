import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '../../components/ui/Button'
import { FormError } from '../../components/ui/FormError'
import { Input } from '../../components/ui/Input'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid work email.'),
  password: z.string().min(1, 'Enter your password.'),
})
type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  })

  useEffect(() => {
    if (auth.status === 'authenticated') navigate('/home', { replace: true })
    if (auth.status === 'mfa_enrollment_required') navigate('/mfa/enroll', { replace: true })
    if (auth.status === 'mfa_challenge_required') navigate('/mfa/challenge', { replace: true })
  }, [auth.status, navigate])

  return (
    <AuthLayout
      eyebrow="Secure employee access"
      title="Welcome back"
      description="Sign in with the work account created for you by Egypro."
    >
      <form className="oh-auth-form" onSubmit={handleSubmit(async (values) => {
        setSubmitError('')
        try {
          await auth.signIn(values.email, values.password)
        } catch {
          setSubmitError('The email or password was not accepted. Please try again.')
        }
      })}>
        <Input label="Work email" type="email" autoComplete="username" error={errors.email?.message} {...register('email')} />
        <Input label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
        {submitError ? <FormError>{submitError}</FormError> : null}
        <Button type="submit" loading={isSubmitting}>Sign in securely</Button>
      </form>
      <p className="oh-auth-footnote">Accounts are invitation-only. Contact HR if you need access restored.</p>
    </AuthLayout>
  )
}
