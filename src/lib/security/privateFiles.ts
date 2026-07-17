import type { AllowedExtension } from './filePolicy'
import { toSafeHttpUrl } from './safeUrl'

const uuidPattern =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const uuidExpression = new RegExp(`^${uuidPattern}$`, 'i')
const categoryExpression = /^[a-z][a-z0-9-]{0,62}$/
const privatePathExpression = new RegExp(
  `^${uuidPattern}/[a-z][a-z0-9-]{0,62}/${uuidPattern}/${uuidPattern}\\.(?:pdf|jpe?g|png|webp|heic|heif|avif)$`,
  'i',
)

interface PrivateObjectPathInput {
  ownerId: string
  category: string
  recordId: string
  extension: AllowedExtension
  objectId?: string
}

interface SignedUrlResult {
  data: { signedUrl: string } | null
  error: unknown
}

interface PrivateDownloadDependencies {
  allowedOrigin: string
  createSignedUrl(path: string, expiresIn: number): Promise<SignedUrlResult>
}

function isUuid(value: string) {
  return uuidExpression.test(value)
}

export function createPrivateObjectPath({
  ownerId,
  category,
  recordId,
  extension,
  objectId = crypto.randomUUID(),
}: PrivateObjectPathInput) {
  if (
    !isUuid(ownerId) ||
    !isUuid(recordId) ||
    !isUuid(objectId) ||
    !categoryExpression.test(category)
  ) {
    throw new Error('A safe private file path could not be created.')
  }

  return `${ownerId}/${category}/${recordId}/${objectId}.${extension}`
}

export async function createPrivateDownloadUrl(
  path: string,
  dependencies: PrivateDownloadDependencies,
  expiresIn = 60,
) {
  const safeExpiry = Number.isSafeInteger(expiresIn) && expiresIn >= 30 && expiresIn <= 300
  if (!privatePathExpression.test(path) || !safeExpiry) {
    throw new Error('The private file download could not be created.')
  }

  const { data, error } = await dependencies.createSignedUrl(path, expiresIn)
  if (error || !data?.signedUrl) {
    throw new Error('The private file download could not be created.')
  }

  const signedUrl = toSafeHttpUrl(data.signedUrl, {
    allowedOrigins: [dependencies.allowedOrigin],
  })
  if (!signedUrl) {
    throw new Error('The private file download could not be created.')
  }

  return signedUrl
}
