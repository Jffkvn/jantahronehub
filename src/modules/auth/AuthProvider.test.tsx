import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AuthProvider, useAuth } from './AuthProvider'
import { accessContext, fakeGateway } from './test/fakes'

function AuthStateProbe() {
  const auth = useAuth()
  return (
    <div>
      <span>{auth.status}</span>
      <span>{auth.access?.roleKeys.join(',')}</span>
    </div>
  )
}

describe('AuthProvider', () => {
  it('settles unauthenticated when no session exists', async () => {
    render(
      <AuthProvider gateway={fakeGateway({ activeSession: null })}>
        <AuthStateProbe />
      </AuthProvider>,
    )

    expect(await screen.findByText('unauthenticated')).toBeInTheDocument()
  })

  it('preserves every assigned role for an authenticated user', async () => {
    const gateway = fakeGateway({
      access: accessContext({ roleKeys: ['hr_admin', 'project_manager'] }),
    })
    render(
      <AuthProvider gateway={gateway}>
        <AuthStateProbe />
      </AuthProvider>,
    )

    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    expect(screen.getByText('hr_admin,project_manager')).toBeInTheDocument()
  })

  it('requires super_admin to enroll TOTP when no verified factor exists', async () => {
    const gateway = fakeGateway({
      access: accessContext({ roleKeys: ['super_admin'], mfaRequired: true }),
    })
    render(
      <AuthProvider gateway={gateway}>
        <AuthStateProbe />
      </AuthProvider>,
    )

    expect(await screen.findByText('mfa_enrollment_required')).toBeInTheDocument()
  })

  it('requires an aal2 challenge whenever a verified factor exists', async () => {
    const gateway = fakeGateway({
      factors: { verifiedTotp: [{ id: 'factor-1' }], unverifiedTotp: [] },
      aal: 'aal1',
    })
    render(
      <AuthProvider gateway={gateway}>
        <AuthStateProbe />
      </AuthProvider>,
    )

    expect(await screen.findByText('mfa_challenge_required')).toBeInTheDocument()
  })

  it('fails closed when access context loading fails', async () => {
    const gateway = fakeGateway()
    gateway.loadAccessContext = async () => {
      throw new Error('network details must not leak')
    }
    render(
      <AuthProvider gateway={gateway}>
        <AuthStateProbe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('error')).toBeInTheDocument())
  })

  it('fails closed when the auth subscription cannot be configured', async () => {
    const gateway = fakeGateway({ activeSession: null })
    gateway.subscribe = () => {
      throw new Error('public configuration is unavailable')
    }

    render(
      <AuthProvider gateway={gateway}>
        <AuthStateProbe />
      </AuthProvider>,
    )

    expect(await screen.findByText('error')).toBeInTheDocument()
  })
})
