import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AuthProvider } from './AuthProvider'
import { LoginPage } from './LoginPage'
import { fakeGateway } from './test/fakes'

describe('LoginPage', () => {
  it('signs in with email and password without exposing signup', async () => {
    const gateway = fakeGateway({ activeSession: null })
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AuthProvider gateway={gateway}>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    await user.type(screen.getByRole('textbox', { name: 'Work email' }), 'dora@egypro.test')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple')
    await user.click(screen.getByRole('button', { name: 'Sign in securely' }))

    expect(gateway.signIn).toHaveBeenCalledWith(
      'dora@egypro.test',
      'correct horse battery staple',
    )
    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument()
  })
})
