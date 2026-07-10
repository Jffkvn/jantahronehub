import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AuthProvider } from './AuthProvider'
import { InvitePage } from './InvitePage'
import { fakeGateway } from './test/fakes'

describe('InvitePage', () => {
  it('accepts only the invite token hash and sets an initial password', async () => {
    const gateway = fakeGateway({ activeSession: null })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/invite?token_hash=safe-hash&redirect=https://evil.test']}>
        <AuthProvider gateway={gateway}>
          <InvitePage />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Create your password' })).toBeVisible()
    expect(gateway.acceptInvite).toHaveBeenCalledWith('safe-hash')

    await user.type(screen.getByLabelText('New password'), 'a strong password 123')
    await user.type(screen.getByLabelText('Confirm password'), 'a strong password 123')
    await user.click(screen.getByRole('button', { name: 'Activate account' }))

    expect(gateway.setInitialPassword).toHaveBeenCalledWith('a strong password 123')
  })

  it('fails safely when the invite token is missing', async () => {
    const gateway = fakeGateway({ activeSession: null })
    render(
      <MemoryRouter initialEntries={['/invite']}>
        <AuthProvider gateway={gateway}>
          <InvitePage />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('This invitation link is invalid')
    expect(gateway.acceptInvite).not.toHaveBeenCalled()
  })
})
