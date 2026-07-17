import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DailyEvidenceInput } from './DailyEvidenceInput'

describe('DailyEvidenceInput', () => {
  it('offers common iPhone and Android photo formats', () => {
    const { container } = render(<DailyEvidenceInput
      files={[]}
      onFilesChange={vi.fn()}
      onError={vi.fn()}
    />)

    expect(container.querySelector('input[type="file"]')).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif,.avif',
    )
    expect(screen.getByText(/HEIC, HEIF or AVIF/)).toBeInTheDocument()
  })
})
