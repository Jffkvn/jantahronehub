import { describe, expect, it } from 'vitest'

import type { ModuleKey, UserRole } from '../../config/modules'
import { getDashboardActions, resolveDashboardKind } from './dashboard-model'

describe('role dashboard model', () => {
  it.each<[UserRole, string]>([
    ['super_admin', 'executive'],
    ['hr_admin', 'hr'],
    ['cfo', 'executive'],
    ['managing_director', 'executive'],
    ['warehouse_manager', 'warehouse'],
    ['project_manager', 'project_manager'],
    ['coordinator', 'coordinator'],
    ['employee', 'employee'],
  ])('maps %s to the %s dashboard', (role, expected) => {
    expect(resolveDashboardKind([role])).toBe(expected)
  })

  it('honours the highest responsibility when a user holds multiple roles', () => {
    expect(resolveDashboardKind(['employee', 'project_manager'])).toBe('project_manager')
    expect(resolveDashboardKind(['coordinator', 'hr_admin'])).toBe('hr')
  })

  it('removes quick actions for modules that are not enabled', () => {
    const enabled: ModuleKey[] = ['home', 'projects', 'reports']
    const actions = getDashboardActions('executive', enabled)

    expect(actions.map((action) => action.to)).toEqual(['/reports', '/projects'])
  })

  it('keeps employee actions inside My Workspace', () => {
    const actions = getDashboardActions('employee', ['home', 'my_workspace'])

    expect(actions).toHaveLength(4)
    expect(actions.every((action) => action.to.startsWith('/my/'))).toBe(true)
  })
})
