import { describe, expect, it } from 'vitest'

import { toSafeExternalUrl, toSafeHttpUrl } from './safeUrl'

describe('toSafeHttpUrl', () => {
  const allowedOrigins = ['https://example.supabase.co']

  it('accepts an HTTPS URL from an explicitly allowed origin', () => {
    expect(
      toSafeHttpUrl(
        'https://example.supabase.co/storage/v1/object/sign/private-files/document.pdf?token=signed',
        { allowedOrigins },
      ),
    ).toBe(
      'https://example.supabase.co/storage/v1/object/sign/private-files/document.pdf?token=signed',
    )
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://evil.example/file.pdf',
    'https://user:password@example.supabase.co/file.pdf',
    '//example.supabase.co/file.pdf',
    'http://example.supabase.co/file.pdf',
  ])('rejects unsafe or unapproved URL %s', (candidate) => {
    expect(toSafeHttpUrl(candidate, { allowedOrigins })).toBeNull()
  })

  it('permits HTTP only for an explicitly allowed local development origin', () => {
    expect(
      toSafeHttpUrl('http://127.0.0.1:54321/storage/v1/object/sign/file', {
        allowedOrigins: ['http://127.0.0.1:54321'],
      }),
    ).toBe('http://127.0.0.1:54321/storage/v1/object/sign/file')
  })
})

describe('toSafeExternalUrl', () => {
  it.each([
    ['https://drive.example/evidence/123', 'https://drive.example/evidence/123'],
    ['http://localhost:5173/evidence/123', 'http://localhost:5173/evidence/123'],
  ])('accepts safe evidence URL %s', (candidate, expected) => {
    expect(toSafeExternalUrl(candidate)).toBe(expected)
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'https://user:password@example.com/evidence',
    '//example.com/evidence',
  ])('rejects unsafe external URL %s', (candidate) => {
    expect(toSafeExternalUrl(candidate)).toBeNull()
  })
})
