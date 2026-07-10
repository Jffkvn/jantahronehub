export interface SafeHttpUrlOptions {
  allowedOrigins: readonly string[]
}

function isLocalDevelopmentUrl(url: URL) {
  return (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  )
}

export function toSafeHttpUrl(
  candidate: string,
  { allowedOrigins }: SafeHttpUrlOptions,
) {
  try {
    const url = new URL(candidate)
    if (url.username || url.password) return null
    if (url.protocol !== 'https:' && !isLocalDevelopmentUrl(url)) return null

    const approvedOrigins = new Set(
      allowedOrigins.map((origin) => new URL(origin).origin),
    )
    if (!approvedOrigins.has(url.origin)) return null

    return url.toString()
  } catch {
    return null
  }
}
