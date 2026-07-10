import { describe, expect, it } from 'vitest'
import type { UserConfig } from 'vite'

import viteConfig from '../vite.config'

describe('Vite security headers', () => {
  const config = viteConfig as UserConfig

  it('keeps the strict CSP on production preview but not the development server', () => {
    expect(config.server?.headers).not.toHaveProperty('Content-Security-Policy')
    expect(config.preview?.headers).toHaveProperty('Content-Security-Policy')
  })
})
