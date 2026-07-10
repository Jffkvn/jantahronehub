import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AuthProvider } from './AuthProvider'
import { RequireAuth } from './RequireAuth'
import { fakeGateway } from './test/fakes'

function renderProtected(gateway = fakeGateway()) {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <AuthProvider gateway={gateway}>
        <Routes>
          <Route path="/login" element={<p>Login destination</p>} />
          <Route path="/mfa/enroll" element={<p>Enrollment destination</p>} />
          <Route path="/mfa/challenge" element={<p>Challenge destination</p>} />
          <Route element={<RequireAuth />}>
            <Route path="/home" element={<p>Protected workspace</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  it('redirects users without a session to the fixed login route', async () => {
    renderProtected(fakeGateway({ activeSession: null }))
    expect(await screen.findByText('Login destination')).toBeInTheDocument()
  })

  it('allows fully authenticated users through', async () => {
    renderProtected()
    expect(await screen.findByText('Protected workspace')).toBeInTheDocument()
  })
})
