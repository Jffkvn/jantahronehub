import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { NotificationCenter } from './NotificationCenter'
import { notificationsApi, type Notification } from './api/notifications'

// Mock the API client
vi.mock('./api/notifications', () => {
  return {
    notificationsApi: {
      listNotifications: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn()
    }
  }
})

const mockNotifications: Notification[] = [
  {
    id: 'notif-1',
    recipient_profile_id: 'user-123',
    title: 'Cash Advance Approved',
    message: 'Your cash advance has been approved.',
    is_read: false,
    category: 'cash',
    created_at: new Date().toISOString(),
    action_path: '/cash/advances/11111111-1111-4111-8111-111111111111'
  },
  {
    id: 'notif-2',
    recipient_profile_id: 'user-123',
    title: 'New Stock Request',
    message: 'Concrete block request submitted.',
    is_read: true,
    category: 'warehouse',
    created_at: new Date().toISOString(),
    action_path: '/inventory/requests/22222222-2222-4222-8222-222222222222'
  }
]

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders loading state initially', async () => {
    // Return a promise that does not resolve immediately to test loading state
    let resolveQuery: (value: Notification[]) => void = () => {}
    const promise = new Promise<Notification[]>((resolve) => {
      resolveQuery = resolve
    })
    vi.mocked(notificationsApi.listNotifications).mockReturnValue(promise)

    renderWithProviders(<NotificationCenter userIdentity="user-123" />)

    // Open dropdown to see list body
    const bellButton = screen.getByRole('button', { name: /Notifications/i })
    await userEvent.click(bellButton)

    expect(screen.getByText(/loading alerts.../i)).toBeInTheDocument()

    // Clean up query
    resolveQuery([])
  })

  it('renders empty state when there are no notifications', async () => {
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue([])

    renderWithProviders(<NotificationCenter userIdentity="user-123" />)

    const bellButton = screen.getByRole('button', { name: /Notifications/i })
    await userEvent.click(bellButton)

    expect(await screen.findByText(/no notifications yet/i)).toBeInTheDocument()
  })

  it('refreshes the active profile notifications whenever the panel opens', async () => {
    vi.mocked(notificationsApi.listNotifications)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(mockNotifications)

    renderWithProviders(<NotificationCenter userIdentity="user-123" />)

    await userEvent.click(screen.getByRole('button', { name: /Notifications/i }))

    expect(await screen.findByText('Cash Advance Approved')).toBeInTheDocument()
    expect(notificationsApi.listNotifications).toHaveBeenCalledTimes(2)
  })

  it('displays the unread notification count', async () => {
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue(mockNotifications)

    renderWithProviders(<NotificationCenter userIdentity="user-123" />)

    // Unread count is 1 (notif-1 is unread, notif-2 is read)
    const bellButton = await screen.findByRole('button', { name: /Notifications, 1 unread/i })
    expect(bellButton).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('marks a single notification as read on click', async () => {
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue(mockNotifications)
    vi.mocked(notificationsApi.markAsRead).mockResolvedValue()

    renderWithProviders(<NotificationCenter userIdentity="user-123" />)

    const bellButton = await screen.findByRole('button', { name: /Notifications/i })
    await userEvent.click(bellButton)

    // Click the unread notification to mark as read
    const unreadNotif = await screen.findByText('Cash Advance Approved')
    await userEvent.click(unreadNotif)

    expect(notificationsApi.markAsRead).toHaveBeenCalledWith('notif-1', expect.any(Object))
  })

  it('marks all notifications as read when clicking mark all read button', async () => {
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue(mockNotifications)
    vi.mocked(notificationsApi.markAllAsRead).mockResolvedValue()

    renderWithProviders(<NotificationCenter userIdentity="user-123" />)

    const bellButton = await screen.findByRole('button', { name: /Notifications/i })
    await userEvent.click(bellButton)

    const markAllBtn = await screen.findByRole('button', { name: /mark all read/i })
    await userEvent.click(markAllBtn)

    expect(notificationsApi.markAllAsRead).toHaveBeenCalled()
  })

  it('renders error state when query fails', async () => {
    vi.mocked(notificationsApi.listNotifications).mockRejectedValue(new Error('Network error'))

    renderWithProviders(<NotificationCenter userIdentity="user-123" />)

    const bellButton = screen.getByRole('button', { name: /Notifications/i })
    await userEvent.click(bellButton)

    expect(await screen.findByText(/notifications could not be loaded/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText(/no notifications yet/i)).not.toBeInTheDocument()
  })

  it('retries the notification query from the visible error state', async () => {
    vi.mocked(notificationsApi.listNotifications)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce([])

    renderWithProviders(<NotificationCenter userIdentity="user-123" />)
    await userEvent.click(screen.getByRole('button', { name: /Notifications/i }))
    await userEvent.click(await screen.findByRole('button', { name: /try again/i }))

    expect(await screen.findByText(/no notifications yet/i)).toBeInTheDocument()
    expect(notificationsApi.listNotifications).toHaveBeenCalledTimes(3)
  })
})
