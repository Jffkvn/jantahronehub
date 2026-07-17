import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../../test/render'
import { CategoryChoice } from './CategoryChoice'

describe('CategoryChoice', () => {
  it('lets the receiver choose to configure a new category without leaving the form', async () => {
    const user = userEvent.setup()
    const onNewCategoryNameChange = vi.fn()

    function Harness() {
      const [categoryId, setCategoryId] = useState('')
      const [newCategoryName, setNewCategoryName] = useState('')
      return (
        <CategoryChoice
          categories={[{ id: 'cat-1', name: 'Cables', description: null }]}
          categoryId={categoryId}
          newCategoryName={newCategoryName}
          newCategoryDescription=""
          onCategoryIdChange={setCategoryId}
          onNewCategoryNameChange={(value) => { setNewCategoryName(value); onNewCategoryNameChange(value) }}
          onNewCategoryDescriptionChange={vi.fn()}
        />
      )
    }

    renderWithProviders(<Harness />)

    await user.selectOptions(screen.getByLabelText('Category'), '__new__')

    expect(screen.getByLabelText('New category name')).toBeInTheDocument()
    expect(screen.getByLabelText('Category description (optional)')).toBeInTheDocument()
    await user.type(screen.getByLabelText('New category name'), 'Fibre accessories')
    expect(onNewCategoryNameChange).toHaveBeenCalled()
  })
})
