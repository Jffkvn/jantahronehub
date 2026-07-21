import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { notificationsApi } from './api/notifications'
import {
  Bell,
  Landmark,
  Package,
  Briefcase,
  Users,
  FileText,
  CheckCheck,
  Loader2
} from 'lucide-react'

interface NotificationCenterProps {
  userIdentity: string
}

export function NotificationCenter({ userIdentity }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // 1. Fetch notifications
  const { data: notifications = [], isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['notifications', userIdentity],
    queryFn: notificationsApi.listNotifications,
    enabled: Boolean(userIdentity),
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    refetchOnMount: 'always'
  })

  // 2. Mutations
  const markAsReadMutation = useMutation({
    mutationFn: notificationsApi.markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }
  })

  const markAllAsReadMutation = useMutation({
    mutationFn: notificationsApi.markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }
  })

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  const unreadCount = notifications.filter((n) => !n.is_read).length

  // Map category to Lucide Icon
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'payroll':
        return <FileText className="text-primary" size={16} />
      case 'cash':
        return <Landmark className="text-warning" size={16} />
      case 'warehouse':
        return <Package className="text-success" size={16} />
      case 'project':
        return <Briefcase className="text-info" size={16} />
      case 'hr':
        return <Users className="text-primary" size={16} />
      default:
        return <Bell className="text-neutral" size={16} />
    }
  }

  const formatRelativeTime = (dateStr: string) => {
    try {
      const diffMs = new Date().getTime() - new Date(dateStr).getTime()
      const diffMins = Math.floor(diffMs / 60000)
      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      const diffHours = Math.floor(diffMins / 60)
      if (diffHours < 24) return `${diffHours}h ago`
      return new Date(dateStr).toLocaleDateString()
    } catch {
      return ''
    }
  }

  return (
    <div className="oh-notification-center" ref={dropdownRef}>
      <button
        className="oh-icon-button oh-notification-button"
        type="button"
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          const nextOpen = !isOpen
          setIsOpen(nextOpen)
          if (nextOpen) void refetch()
        }}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="oh-notification-count" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="oh-notification-panel"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="oh-notification-panel__header">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button
                className="oh-notification-panel__read-all"
                type="button"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
              >
                {markAllAsReadMutation.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <CheckCheck size={13} />
                )}
                Mark all read
              </button>
            )}
          </div>

          <div className="oh-notification-panel__body">
            {isLoading ? (
              <div className="oh-notification-panel__state">
                <Loader2 size={20} className="animate-spin" />
                Loading alerts...
              </div>
            ) : isError ? (
              <div className="oh-notification-panel__state">
                <p>Notifications could not be loaded.</p>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  disabled={isFetching}
                  className="oh-button oh-button-secondary"
                >
                  {isFetching ? 'Trying again...' : 'Try again'}
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="oh-notification-panel__state">
                No notifications yet.
              </div>
            ) : (
              <div className="oh-notification-list" role="list">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    role="listitem"
                    className={`oh-notification-item${n.is_read ? '' : ' oh-notification-item--unread'}`}
                    onClick={async () => {
                      if (!n.is_read) await markAsReadMutation.mutateAsync(n.id)
                      setIsOpen(false)
                      if (n.action_path) navigate(n.action_path)
                    }}
                  >
                    <span className="oh-notification-item__icon">
                      {getCategoryIcon(n.category)}
                    </span>
                    <div className="oh-notification-item__content">
                      <div className="oh-notification-item__heading">
                        <strong>{n.title}</strong>
                        <span>
                          {formatRelativeTime(n.created_at)}
                        </span>
                      </div>
                      <p>{n.message}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
