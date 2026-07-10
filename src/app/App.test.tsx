import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('OneHub application', () => {
  it('introduces the Egypro OneHub product', async () => {
    document.body.innerHTML = '<div id="root"></div>'

    await import('../main')

    expect(
      await screen.findByRole('heading', { name: 'Egypro OneHub' }),
    ).toBeInTheDocument()
  })
})
