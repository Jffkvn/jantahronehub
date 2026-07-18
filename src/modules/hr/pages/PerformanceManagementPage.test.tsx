import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { EmployeeApi } from '../api/employees'
import type { PerformanceApi } from '../api/performance'
import { PerformanceManagementPage } from './PerformanceManagementPage'

const cycle = { id: '11111111-1111-4111-8111-111111111111', name: 'Mid-year 2026', startDate: '2026-01-01', endDate: '2026-06-30', status: 'active' as const, totalReviews: 1, completedReviews: 0 }
const review = { id: '22222222-2222-4222-8222-222222222222', cycleId: cycle.id, cycleName: cycle.name, employeeId: '33333333-3333-4333-8333-333333333333', employeeNumber: 'EGY-001', employeeName: 'Amina Nsubuga', reviewerProfileId: '44444444-4444-4444-8444-444444444444', reviewerName: 'Julie Moore', status: 'manager_submitted' as const, overallScore: 4, managerComments: 'Strong delivery', recommendIncrement: true, recommendPromotion: false, hrReason: null, acknowledgedAt: null, acknowledgmentComment: null, goals: [{ id: '55555555-5555-4555-8555-555555555555', description: 'Deliver sites', managerRating: 4 }] }
function api(): PerformanceApi { return { listCycles: vi.fn().mockResolvedValue([cycle]), createCycle: vi.fn(), setCycleStatus: vi.fn(), listReviews: vi.fn().mockResolvedValue([review]), listAssignedReviews: vi.fn(), listMyReviews: vi.fn(), listReviewers: vi.fn().mockResolvedValue([{ profileId: review.reviewerProfileId, displayName: review.reviewerName, roleLabel: 'Project Manager' }]), startReview: vi.fn(), saveReview: vi.fn(), submitReview: vi.fn(), decide: vi.fn().mockResolvedValue(undefined), acknowledge: vi.fn(), importReview: vi.fn() } }
function employees(): EmployeeApi { return { list: vi.fn().mockResolvedValue([{ id: review.employeeId, employeeNumber: review.employeeNumber, legalName: review.employeeName, companyEmail: null, workPhone: null, active: true, departmentName: null, jobTitleName: null, payGradeName: null, startDate: null, endDate: null }]), get: vi.fn(), setup: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn(), offboard: vi.fn() } }

test('shows cycle progress and lets HR approve a manager assessment', async () => {
  const user = userEvent.setup(); const performance = api()
  renderWithProviders(<PerformanceManagementPage api={performance} employeesApi={employees()} />)
  expect(await screen.findByRole('heading', { name: /performance management/i })).toBeInTheDocument()
  await user.click(await screen.findByRole('button', { name: /review assessment/i }))
  await user.type(screen.getByLabelText(/hr decision note/i), 'Approved after calibration')
  await user.click(screen.getByRole('button', { name: /^approve review$/i }))
  expect(performance.decide).toHaveBeenCalledWith({ reviewId: review.id, decision: 'approved', reason: 'Approved after calibration' })
})

test('opens the cycle creation form', async () => {
  const user = userEvent.setup(); renderWithProviders(<PerformanceManagementPage api={api()} employeesApi={employees()} />)
  await user.click(await screen.findByRole('button', { name: /new review cycle/i }))
  expect(screen.getByRole('dialog', { name: /create performance cycle/i })).toBeInTheDocument()
})
