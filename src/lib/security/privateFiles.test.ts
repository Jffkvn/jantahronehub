import { describe, expect, it, vi } from 'vitest'

import {
  createPrivateDownloadUrl,
  createPrivateObjectPath,
} from './privateFiles'

const ownerId = '10000000-0000-4000-8000-000000000001'
const recordId = '20000000-0000-4000-8000-000000000002'
const objectId = '30000000-0000-4000-8000-000000000003'

describe('createPrivateObjectPath', () => {
  it('uses validated identifiers and a generated object name instead of the user filename', () => {
    expect(
      createPrivateObjectPath({
        ownerId,
        category: 'employee-documents',
        recordId,
        extension: 'pdf',
        objectId,
      }),
    ).toBe(`${ownerId}/employee-documents/${recordId}/${objectId}.pdf`)
  })

  it('rejects path traversal and invalid identifiers', () => {
    expect(() =>
      createPrivateObjectPath({
        ownerId,
        category: '../payroll',
        recordId,
        extension: 'pdf',
        objectId,
      }),
    ).toThrow('A safe private file path could not be created.')
  })
})

describe('createPrivateDownloadUrl', () => {
  it('returns a short-lived signed URL from the configured Supabase origin', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: {
        signedUrl:
          'https://example.supabase.co/storage/v1/object/sign/private-files/file.pdf?token=signed',
      },
      error: null,
    })

    await expect(
      createPrivateDownloadUrl(
        `${ownerId}/employee-documents/${recordId}/${objectId}.pdf`,
        {
          allowedOrigin: 'https://example.supabase.co',
          createSignedUrl,
        },
      ),
    ).resolves.toContain('https://example.supabase.co/storage/v1/object/sign/')
    expect(createSignedUrl).toHaveBeenCalledWith(
      `${ownerId}/employee-documents/${recordId}/${objectId}.pdf`,
      60,
    )
  })

  it('rejects signed URLs returned from an unexpected origin', async () => {
    await expect(
      createPrivateDownloadUrl(
        `${ownerId}/employee-documents/${recordId}/${objectId}.pdf`,
        {
          allowedOrigin: 'https://example.supabase.co',
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: 'https://evil.example/file.pdf' },
            error: null,
          }),
        },
      ),
    ).rejects.toThrow('The private file download could not be created.')
  })

  it('rejects a caller-controlled storage path before requesting a signed URL', async () => {
    const createSignedUrl = vi.fn()
    await expect(
      createPrivateDownloadUrl('../payroll.xlsx', {
        allowedOrigin: 'https://example.supabase.co',
        createSignedUrl,
      }),
    ).rejects.toThrow('The private file download could not be created.')
    expect(createSignedUrl).not.toHaveBeenCalled()
  })
})
