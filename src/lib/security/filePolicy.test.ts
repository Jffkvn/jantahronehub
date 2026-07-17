import { describe, expect, it } from 'vitest'

import {
  MAX_PRIVATE_FILE_BYTES,
  hasAllowedFileSignature,
  validatePrivateFile,
  validatePrivateFileForUpload,
} from './filePolicy'

describe('validatePrivateFile', () => {
  it('accepts an allowed PDF within the size limit', () => {
    expect(
      validatePrivateFile({
        name: 'retirement-evidence.pdf',
        type: 'application/pdf',
        size: 2_048,
      }),
    ).toEqual({ ok: true, extension: 'pdf' })
  })

  it.each([
    ['site-photo.heic', 'image/heic', 'heic'],
    ['site-photo.heif', 'image/heif', 'heif'],
    ['site-photo.avif', 'image/avif', 'avif'],
  ])('accepts phone photo metadata for %s', (name, type, extension) => {
    expect(validatePrivateFile({ name, type, size: 2_048 })).toEqual({
      ok: true,
      extension,
    })
  })

  it.each([
    ['script.svg', 'image/svg+xml'],
    ['page.html', 'text/html'],
    ['payroll.xlsm', 'application/vnd.ms-excel.sheet.macroEnabled.12'],
    ['installer.exe', 'application/x-msdownload'],
  ])('rejects active-content file %s', (name, type) => {
    expect(validatePrivateFile({ name, type, size: 1_024 })).toMatchObject({
      ok: false,
      code: 'unsupported_type',
    })
  })

  it('rejects a MIME type that does not match the extension', () => {
    expect(
      validatePrivateFile({
        name: 'receipt.pdf',
        type: 'image/png',
        size: 1_024,
      }),
    ).toMatchObject({ ok: false, code: 'type_mismatch' })
  })

  it('rejects empty and oversized files', () => {
    expect(
      validatePrivateFile({ name: 'empty.pdf', type: 'application/pdf', size: 0 }),
    ).toMatchObject({ ok: false, code: 'empty_file' })
    expect(
      validatePrivateFile({
        name: 'large.pdf',
        type: 'application/pdf',
        size: MAX_PRIVATE_FILE_BYTES + 1,
      }),
    ).toMatchObject({ ok: false, code: 'file_too_large' })
  })
})

describe('hasAllowedFileSignature', () => {
  it('recognizes the allowed PDF, JPEG, PNG and WebP signatures', () => {
    expect(
      hasAllowedFileSignature('application/pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])),
    ).toBe(true)
    expect(
      hasAllowedFileSignature('image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0])),
    ).toBe(true)
    expect(
      hasAllowedFileSignature(
        'image/png',
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe(true)
    expect(
      hasAllowedFileSignature(
        'image/webp',
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
      ),
    ).toBe(true)
  })

  it.each([
    ['image/heic', 'heic'],
    ['image/heif', 'mif1'],
    ['image/avif', 'avif'],
  ])('recognizes an ISO-BMFF %s signature', (mimeType, brand) => {
    expect(
      hasAllowedFileSignature(
        mimeType,
        new Uint8Array([
          0, 0, 0, 24,
          0x66, 0x74, 0x79, 0x70,
          ...Array.from(brand).map((character) => character.charCodeAt(0)),
        ]),
      ),
    ).toBe(true)
  })

  it('rejects content whose signature contradicts its declared MIME type', () => {
    expect(
      hasAllowedFileSignature(
        'application/pdf',
        new Uint8Array([0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74]),
      ),
    ).toBe(false)
  })
})

describe('validatePrivateFileForUpload', () => {
  it('rejects a file whose bytes contradict its otherwise valid metadata', async () => {
    const file = new File(
      [new Uint8Array([0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74])],
      'evidence.pdf',
      { type: 'application/pdf' },
    )

    await expect(validatePrivateFileForUpload(file)).resolves.toMatchObject({
      ok: false,
      code: 'invalid_signature',
    })
  })
})
