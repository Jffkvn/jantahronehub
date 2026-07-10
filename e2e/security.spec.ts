import { expect, test } from '@playwright/test'

test('serves the browser security baseline on application routes', async ({ request }) => {
  const response = await request.get('/login')
  const headers = response.headers()

  expect(response.ok()).toBe(true)
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['permissions-policy']).toContain('camera=(self)')
  expect(headers['permissions-policy']).toContain('microphone=()')
  expect(headers['cross-origin-opener-policy']).toBe('same-origin')
  expect(headers['content-security-policy']).toContain("default-src 'self'")
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['content-security-policy']).not.toContain("'unsafe-eval'")
  expect(headers['content-security-policy']).not.toContain("'unsafe-inline'")
})
