import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { fakeGateway } from '../modules/auth/test/fakes'
import { renderWithProviders } from '../test/render'
import { App } from './App'

describe('OneHub application', () => {
  it('presents the branded invite-only login entry point', async () => {
    renderWithProviders(
      <App authGateway={fakeGateway({ activeSession: null })} />,
    )

    expect(
      await screen.findByRole('heading', { name: 'Welcome back' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Egypro OneHub')).toBeInTheDocument()
    expect(screen.getByText(/accounts are invitation-only/i)).toBeInTheDocument()
  })
})
