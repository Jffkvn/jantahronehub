import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '../../components/ui/Button'
import { FormError } from '../../components/ui/FormError'
import { Input } from '../../components/ui/Input'
import type { TotpEnrollment } from './AuthGateway'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'

export function TotpEnrollmentPage() {
  const auth = useAuth()
  const { enrollTotp } = auth
  const navigate = useNavigate()
  const [enrollment, setEnrollment] = useState<TotpEnrollment>()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const enrollmentRequest = useRef<Promise<TotpEnrollment> | undefined>(undefined)

  useEffect(() => {
    let active = true
    const request = enrollmentRequest.current ?? (enrollmentRequest.current = enrollTotp())
    request
      .then((value) => { if (active) setEnrollment(value) })
      .catch(() => { if (active) setError('Authenticator setup could not be started. Sign out and try again.') })
    return () => { active = false }
  }, [enrollTotp])

  return (
    <AuthLayout
      eyebrow="Required security step"
      title="Protect your administrator account"
      description="Scan this QR code with an authenticator app, then enter its six-digit code."
    >
      {enrollment ? (
        <div className="oh-mfa-setup">
          <img className="oh-mfa-qr" src={enrollment.qrCode} alt="Authenticator setup QR code" />
          <Button variant="ghost" onClick={() => setShowSecret((current) => !current)}>
            {showSecret ? 'Hide setup key' : 'Cannot scan? Show setup key'}
          </Button>
          {showSecret ? <code className="oh-mfa-secret">{enrollment.secret}</code> : null}
          <Input
            label="Six-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          {error ? <FormError>{error}</FormError> : null}
          <Button loading={submitting} disabled={code.length !== 6} onClick={async () => {
            setSubmitting(true)
            setError('')
            try {
              await auth.verifyTotp(enrollment.factorId, code)
              auth.refreshSecurity()
              navigate('/home', { replace: true })
            } catch {
              setError('That code was not accepted. Wait for a new code and try again.')
            } finally {
              setSubmitting(false)
            }
          }}>Verify authenticator</Button>
        </div>
      ) : error ? <FormError>{error}</FormError> : <div className="oh-route-loading" role="status"><span /><p>Preparing authenticator…</p></div>}
      <p className="oh-auth-footnote">Keep a second authenticator enrolled securely. OneHub does not provide a client-side MFA bypass.</p>
    </AuthLayout>
  )
}
