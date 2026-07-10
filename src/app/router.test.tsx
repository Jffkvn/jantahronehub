import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppRouter } from './router'

describe('AppRouter', () => {
  it('loads the development shell showcase without bypassing authentication', async () => {
    render(
      <MemoryRouter initialEntries={['/components/shell']}>
        <AppRouter />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: /your onehub workspace/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Primary navigation')).toBeInTheDocument()
  })
})
