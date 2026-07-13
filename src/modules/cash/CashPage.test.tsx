import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import CashPage from './CashPage'

vi.mock('./pages/CashAdvancesPage', () => ({ CashAdvancesPage: () => <div>Cash advances</div> }))
vi.mock('./pages/AdvanceDetailPage', () => ({ AdvanceDetailPage: () => <div>Advance detail</div> }))

function CurrentPath() {
  return <output aria-label="Current path">{useLocation().pathname}</output>
}

describe('CashPage navigation', () => {
  it('keeps the advances ledger at its canonical URL', () => {
    render(
      <MemoryRouter initialEntries={['/cash/advances']}>
        <Routes>
          <Route path="/cash/*" element={<CashPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const link = screen.getByRole('link', { name: 'Advances Ledger' })
    expect(link).toHaveAttribute('href', '/cash/advances')
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('recovers an invalid cash URL to the advances ledger once', async () => {
    render(
      <MemoryRouter initialEntries={['/cash/not-a-page']}>
        <CurrentPath />
        <Routes>
          <Route path="/cash/*" element={<CashPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText('Current path')).toHaveTextContent('/cash/advances')
  })
})
