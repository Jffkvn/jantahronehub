export const MAX_PRIVATE_FILE_BYTES = 10 * 1024 * 1024

const allowedTypes = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const

export type AllowedExtension = keyof typeof allowedTypes
type AllowedMimeType = (typeof allowedTypes)[AllowedExtension]

export type PrivateFilePolicyResult =
  | { ok: true; extension: AllowedExtension }
  | {
      ok: false
      code:
        | 'empty_file'
        | 'file_too_large'
        | 'unsupported_type'
        | 'type_mismatch'
        | 'invalid_signature'
    }

interface FileMetadata {
  name: string
  type: string
  size: number
}

export function validatePrivateFile(
  file: FileMetadata,
): PrivateFilePolicyResult {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    return { ok: false, code: 'empty_file' }
  }
  if (file.size > MAX_PRIVATE_FILE_BYTES) {
    return { ok: false, code: 'file_too_large' }
  }

  const extension = file.name.split('.').at(-1)?.toLowerCase()
  if (!extension || !(extension in allowedTypes)) {
    return { ok: false, code: 'unsupported_type' }
  }

  const allowedExtension = extension as AllowedExtension
  if (allowedTypes[allowedExtension] !== file.type.toLowerCase()) {
    return { ok: false, code: 'type_mismatch' }
  }

  return { ok: true, extension: allowedExtension }
}

function startsWith(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((byte, index) => bytes[index] === byte)
}

export function hasAllowedFileSignature(
  mimeType: string,
  bytes: Uint8Array,
) {
  const signatures: Record<AllowedMimeType, (input: Uint8Array) => boolean> = {
    'application/pdf': (input) => startsWith(input, [0x25, 0x50, 0x44, 0x46, 0x2d]),
    'image/jpeg': (input) => startsWith(input, [0xff, 0xd8, 0xff]),
    'image/png': (input) =>
      startsWith(input, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    'image/webp': (input) =>
      startsWith(input, [0x52, 0x49, 0x46, 0x46]) &&
      startsWith(input.slice(8), [0x57, 0x45, 0x42, 0x50]),
  }

  return mimeType in signatures
    ? signatures[mimeType as AllowedMimeType](bytes)
    : false
}

export async function validatePrivateFileForUpload(
  file: File,
): Promise<PrivateFilePolicyResult> {
  const metadataResult = validatePrivateFile(file)
  if (!metadataResult.ok) return metadataResult

  const prefix = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (!hasAllowedFileSignature(file.type.toLowerCase(), prefix)) {
    return { ok: false, code: 'invalid_signature' }
  }

  return metadataResult
}
