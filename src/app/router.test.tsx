import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppRouter } from './router'

describe('AppRouter', () => {
  it('loads the home module inside the OneHub shell', async () => {
    render(
      <MemoryRouter initialEntries={['/home']}>
        <AppRouter />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: /your onehub workspace/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Primary navigation')).toBeInTheDocument()
  })
})
