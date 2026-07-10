import { vi } from 'vitest'

import type {
  AccessContext,
  AuthGateway,
  AuthSession,
  FactorState,
} from '../AuthGateway'

export const session: AuthSession = {
  userId: '10000000-0000-0000-0000-000000000001',
  email: 'user@egypro.test',
}

export function accessContext(
  overrides: Partial<AccessContext> = {},
): AccessContext {
  return {
    profile: {
      id: session.userId,
      displayName: 'Dora K.',
      status: 'active',
    },
    isActive: true,
    roleKeys: ['hr_admin'],
    permissionKeys: ['profiles.read'],
    enabledModules: ['home', 'my_workspace', 'hr'],
    mfaPolicy: {
      method: 'totp',
      enforcedRoles: ['super_admin'],
      optionalForOtherRoles: true,
    },
    mfaRequired: false,
    ...overrides,
  }
}

export function fakeGateway(options?: {
  activeSession?: AuthSession | null
  access?: AccessContext
  factors?: FactorState
  aal?: 'aal1' | 'aal2'
}): AuthGateway {
  let listener: ((event: string, nextSession: AuthSession | null) => void) | undefined
  const activeSession = options?.activeSession === undefined ? session : options.activeSession

  return {
    getSession: vi.fn().mockResolvedValue(activeSession),
    subscribe: vi.fn((nextListener) => {
      listener = nextListener
      return () => {
        listener = undefined
      }
    }),
    signIn: vi.fn().mockImplementation(async () => {
      listener?.('SIGNED_IN', session)
      return session
    }),
    acceptInvite: vi.fn().mockImplementation(async () => {
      listener?.('SIGNED_IN', session)
      return session
    }),
    setInitialPassword: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockImplementation(async () => {
      listener?.('SIGNED_OUT', null)
    }),
    loadAccessContext: vi.fn().mockResolvedValue(options?.access ?? accessContext()),
    listFactors: vi.fn().mockResolvedValue(
      options?.factors ?? { verifiedTotp: [], unverifiedTotp: [] },
    ),
    enrollTotp: vi.fn().mockResolvedValue({
      factorId: 'factor-new',
      qrCode: 'data:image/svg+xml;base64,PHN2Zy8+',
      secret: 'SAFE-TEST-SECRET',
    }),
    verifyTotp: vi.fn().mockResolvedValue(undefined),
    getAal: vi.fn().mockResolvedValue(options?.aal ?? 'aal1'),
  }
}
