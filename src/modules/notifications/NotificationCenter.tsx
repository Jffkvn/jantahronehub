import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // 1. Fetch notifications
  const { data: notifications = [], isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.listNotifications,
    refetchInterval: 15000 // Poll every 15s to get live alerts in topbar
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
  };

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
  };

  return (
    <div className="oh-notification-center" ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        className="oh-icon-button oh-notification-button"
        type="button"
        aria-label={`Notifications, ${unreadCount} unread`}
        onClick={() => setIsOpen(!isOpen)}
        style={{ position: 'relative' }}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              width: '8px',
              height: '8px',
              background: 'var(--color-danger)',
              borderRadius: '50%',
              display: 'block'
            }}
            aria-hidden="true"
          />
        )}
      </button>

      {isOpen && (
        <div
          className="oh-card"
          style={{
            position: 'absolute',
            top: 'calc(100% + var(--space-2))',
            right: 0,
            width: '360px',
            maxHeight: '440px',
            zIndex: 999,
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--color-border)',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 'var(--space-3) var(--space-4)',
              borderBottom: '1px solid var(--color-border)',
              background: 'var(--color-background-subtle)'
            }}
          >
            <strong style={{ fontSize: '0.9rem', fontWeight: 700 }}>Notifications</strong>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.75rem',
                  color: 'var(--color-primary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
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

          {/* List Body */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {isLoading ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto var(--space-2)' }} />
                Loading alerts...
              </div>
            ) : isError ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                <p style={{ margin: '0 0 var(--space-3)' }}>Notifications could not be loaded.</p>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  disabled={isFetching}
                  className="oh-button oh-button-secondary"
                  style={{ fontSize: '0.75rem' }}
                >
                  {isFetching ? 'Trying again...' : 'Try again'}
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                No notifications yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (!n.is_read) {
                        markAsReadMutation.mutate(n.id)
                      }
                    }}
                    style={{
                      display: 'flex',
                      gap: 'var(--space-3)',
                      padding: 'var(--space-3) var(--space-4)',
                      textAlign: 'left',
                      background: n.is_read ? 'transparent' : 'var(--color-primary-lightest)',
                      border: 'none',
                      borderBottom: '1px solid var(--color-border)',
                      cursor: 'pointer',
                      width: '100%',
                      transition: 'background var(--transition-fast)'
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: 'var(--color-background-subtle)',
                        flexShrink: 0
                      }}
                    >
                      {getCategoryIcon(n.category)}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                        <strong style={{ fontSize: '0.8rem', fontWeight: n.is_read ? 600 : 700, color: 'var(--color-text)' }}>
                          {n.title}
                        </strong>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                          {formatRelativeTime(n.created_at)}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '2px 0 0 0', lineBreak: 'anywhere' }}>
                        {n.message}
                      </p>
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
