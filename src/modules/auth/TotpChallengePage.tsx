import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '../../components/ui/Button'
import { FormError } from '../../components/ui/FormError'
import { Input } from '../../components/ui/Input'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'

export function TotpChallengePage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  return (
    <AuthLayout
      eyebrow="Two-step verification"
      title="Enter your authenticator code"
      description="Use the current six-digit code from your enrolled authenticator app."
    >
      <div className="oh-auth-form">
        <Input label="Six-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
        {error ? <FormError>{error}</FormError> : null}
        <Button loading={submitting} disabled={!auth.verifiedFactorId || code.length !== 6} onClick={async () => {
          if (!auth.verifiedFactorId) return
          setSubmitting(true)
          setError('')
          try {
            await auth.verifyTotp(auth.verifiedFactorId, code)
            auth.refreshSecurity()
            navigate('/home', { replace: true })
          } catch {
            setError('That code was not accepted. Wait for a new code and try again.')
          } finally {
            setSubmitting(false)
          }
        }}>Verify and continue</Button>
        <Button variant="ghost" onClick={() => auth.signOut()}>Sign out</Button>
      </div>
    </AuthLayout>
  )
}
