import { describe, expect, it } from 'vitest'

import { getVisibleModules, oneHubModules } from './modules'

const enabledModules = oneHubModules.map((module) => module.key)

describe('role module visibility', () => {
  it('keeps MD oversight in Reports without exposing HR employee maintenance', () => {
    const keys = getVisibleModules('managing_director', enabledModules).map((module) => module.key)

    expect(keys).toContain('reports')
    expect(keys).not.toContain('hr')
    expect(keys).not.toContain('inventory')
  })

  it('does not advertise general governance reports to Warehouse Manager', () => {
    const keys = getVisibleModules('warehouse_manager', enabledModules).map((module) => module.key)

    expect(keys).toContain('inventory')
    expect(keys).not.toContain('reports')
  })
})
