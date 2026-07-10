import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

import { securityHeaders } from './config/securityHeaders'

export default defineConfig({
  plugins: [react()],
  server: {
    headers: securityHeaders,
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
