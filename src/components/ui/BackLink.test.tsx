import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../test/render'
import { BackLink } from './BackLink'

describe('BackLink', () => {
  it('always exposes a stable destination instead of relying on browser history', () => {
    renderWithProviders(<BackLink to="/hr/payroll">Payroll runs</BackLink>)

    const link = screen.getByRole('link', { name: 'Payroll runs' })
    expect(link).toHaveAttribute('href', '/hr/payroll')
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
