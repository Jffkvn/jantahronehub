import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { PerformanceApi } from '../../hr/api/performance'
import { MyPerformancePage } from './MyPerformancePage'

const review = { id: '22222222-2222-4222-8222-222222222222', cycleId: '11111111-1111-4111-8111-111111111111', cycleName: 'Mid-year 2026', employeeId: '33333333-3333-4333-8333-333333333333', employeeNumber: 'EGY-001', employeeName: 'Amina Nsubuga', reviewerProfileId: '44444444-4444-4444-8444-444444444444', reviewerName: 'Julie Moore', status: 'hr_approved' as const, overallScore: 4, managerComments: 'Strong delivery', recommendIncrement: true, recommendPromotion: false, hrReason: 'Approved', acknowledgedAt: null, acknowledgmentComment: null, goals: [{ id: '55555555-5555-4555-8555-555555555555', description: 'Deliver sites', managerRating: 4 }] }
function api(): PerformanceApi { return { listCycles: vi.fn(), createCycle: vi.fn(), setCycleStatus: vi.fn(), listReviews: vi.fn(), listAssignedReviews: vi.fn().mockResolvedValue([]), listMyReviews: vi.fn().mockResolvedValue([review]), listReviewers: vi.fn(), startReview: vi.fn(), saveReview: vi.fn(), submitReview: vi.fn(), decide: vi.fn(), acknowledge: vi.fn(), importReview: vi.fn() } }

test('shows the released employee review and acknowledgment action', async () => {
  const user = userEvent.setup()
  renderWithProviders(<MyPerformancePage api={api()} />)
  expect(await screen.findByRole('heading', { name: /my performance/i })).toBeInTheDocument()
  await user.click(await screen.findByRole('button', { name: /view review/i }))
  expect(await screen.findByText('Strong delivery')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /acknowledge review/i })).toBeInTheDocument()
})
