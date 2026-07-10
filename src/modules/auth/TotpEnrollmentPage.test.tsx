import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AuthProvider } from './AuthProvider'
import { TotpEnrollmentPage } from './TotpEnrollmentPage'
import { accessContext, fakeGateway } from './test/fakes'

describe('TotpEnrollmentPage', () => {
  it('keeps the secret hidden and verifies a six-digit authenticator code', async () => {
    const gateway = fakeGateway({
      access: accessContext({ roleKeys: ['super_admin'], mfaRequired: true }),
    })
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AuthProvider gateway={gateway}>
          <TotpEnrollmentPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByAltText('Authenticator setup QR code')).toBeVisible()
    expect(screen.queryByText('SAFE-TEST-SECRET')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Six-digit code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify authenticator' }))

    expect(gateway.verifyTotp).toHaveBeenCalledWith('factor-new', '123456')
  })
})
