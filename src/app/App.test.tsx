import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/render'
import { App } from './App'

describe('OneHub application', () => {
  it('introduces the Egypro OneHub product', async () => {
    renderWithProviders(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Egypro OneHub' }),
    ).toBeInTheDocument()
  })
})
