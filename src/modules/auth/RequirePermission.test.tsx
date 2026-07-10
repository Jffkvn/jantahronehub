import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AuthProvider } from './AuthProvider'
import { RequirePermission } from './RequirePermission'
import { accessContext, fakeGateway } from './test/fakes'

describe('RequirePermission', () => {
  it('denies a missing exact permission key', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider gateway={fakeGateway({ access: accessContext({ permissionKeys: [] }) })}>
          <Routes>
            <Route path="/forbidden" element={<p>Permission denied</p>} />
            <Route element={<RequirePermission permission="features.manage" />}>
              <Route path="/admin" element={<p>Admin tools</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Permission denied')).toBeInTheDocument()
  })
})
