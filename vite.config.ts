import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

import { securityHeaders } from './config/securityHeaders'

const developmentHeaders = Object.fromEntries(
  Object.entries(securityHeaders).filter(([name]) => name !== 'Content-Security-Policy'),
)

export default defineConfig({
  plugins: [react()],
  server: {
    headers: developmentHeaders,
  },
  preview: {
    headers: securityHeaders,
  },
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
