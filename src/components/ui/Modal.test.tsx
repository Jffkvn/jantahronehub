import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../test/render'
import { Button } from './Button'
import { Modal } from './Modal'

describe('Modal', () => {
  it('labels the dialog, focuses it, and closes with Escape', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <Modal open title="Archive employee" onClose={onClose}>
        <p>This employee will no longer appear in active lists.</p>
        <Button>Confirm archive</Button>
      </Modal>,
    )

    expect(screen.getByRole('dialog', { name: 'Archive employee' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders nothing while closed', () => {
    renderWithProviders(
      <Modal open={false} title="Hidden dialog" onClose={vi.fn()}>
        Hidden content
      </Modal>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
