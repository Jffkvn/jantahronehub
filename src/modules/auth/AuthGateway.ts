import { z } from 'zod'

import type { ModuleKey, UserRole } from '../../config/modules'
import { getSupabaseClient } from '../../lib/supabase/client'

export interface AuthSession {
  userId: string
  email: string
}

export interface AccessContext {
  profile: {
    id: string
    displayName: string
    avatarPath?: string
    status: 'active' | 'deactivated'
  } | null
  isActive: boolean
  roleKeys: UserRole[]
  permissionKeys: string[]
  enabledModules: ModuleKey[]
  mfaPolicy: {
    method: 'totp'
    enforcedRoles: UserRole[]
    optionalForOtherRoles: boolean
  }
  mfaRequired: boolean
}

export interface FactorState {
  verifiedTotp: Array<{ id: string }>
  unverifiedTotp: Array<{ id: string }>
}

export interface TotpEnrollment {
  factorId: string
  qrCode: string
  secret: string
}

export interface AuthGateway {
  getSession(): Promise<AuthSession | null>
  subscribe(listener: (event: string, session: AuthSession | null) => void): () => void
  signIn(email: string, password: string): Promise<AuthSession>
  acceptInvite(tokenHash: string): Promise<AuthSession>
  setInitialPassword(password: string): Promise<void>
  signOut(): Promise<void>
  loadAccessContext(): Promise<AccessContext>
  listFactors(): Promise<FactorState>
  enrollTotp(): Promise<TotpEnrollment>
  verifyTotp(factorId: string, code: string): Promise<void>
  getAal(): Promise<'aal1' | 'aal2'>
}

const userRoles = z.enum([
  'super_admin',
  'hr_admin',
  'employee',
  'coordinator',
  'project_manager',
  'warehouse_manager',
  'cfo',
  'managing_director',
])

const moduleKeys = z.enum([
  'home',
  'my_workspace',
  'hr',
  'inventory',
  'cash',
  'projects',
  'tracker',
  'reports',
  'admin',
])

const accessContextSchema = z.object({
  profile: z
    .object({
      id: z.string().uuid(),
      display_name: z.string().min(1),
      avatar_path: z.string().nullish(),
      status: z.enum(['active', 'deactivated']),
    })
    .nullable(),
  is_active: z.boolean(),
  role_keys: z.array(userRoles),
  permission_keys: z.array(z.string()),
  enabled_modules: z.array(moduleKeys),
  mfa_policy: z.object({
    method: z.literal('totp'),
    enforced_roles: z.array(userRoles),
    optional_for_other_roles: z.boolean(),
  }),
  mfa_required: z.boolean(),
})

function toSession(session: { user: { id: string; email?: string } } | null) {
  if (!session) return null
  return {
    userId: session.user.id,
    email: session.user.email ?? '',
  }
}

function safeAuthMessage() {
  return new Error('We could not complete that authentication request. Please try again.')
}

export function createSupabaseAuthGateway(): AuthGateway {
  return {
    async getSession() {
      const { data, error } = await getSupabaseClient().auth.getSession()
      if (error) throw safeAuthMessage()
      return toSession(data.session)
    },
    subscribe(listener) {
      const { data } = getSupabaseClient().auth.onAuthStateChange((event, session) => {
        listener(event, toSession(session))
      })
      return () => data.subscription.unsubscribe()
    },
    async signIn(email, password) {
      const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password })
      if (error || !data.session) throw safeAuthMessage()
      return toSession(data.session) as AuthSession
    },
    async acceptInvite(tokenHash) {
      const { data, error } = await getSupabaseClient().auth.verifyOtp({
        token_hash: tokenHash,
        type: 'invite',
      })
      if (error || !data.session) throw safeAuthMessage()
      return toSession(data.session) as AuthSession
    },
    async setInitialPassword(password) {
      const { error } = await getSupabaseClient().auth.updateUser({ password })
      if (error) throw safeAuthMessage()
    },
    async signOut() {
      const { error } = await getSupabaseClient().auth.signOut({ scope: 'local' })
      if (error) throw safeAuthMessage()
    },
    async loadAccessContext() {
      const { data, error } = await getSupabaseClient().rpc('get_my_access_context')
      if (error) throw safeAuthMessage()
      const parsed = accessContextSchema.parse(data)
      return {
        profile: parsed.profile
          ? {
              id: parsed.profile.id,
              displayName: parsed.profile.display_name,
              avatarPath: parsed.profile.avatar_path ?? undefined,
              status: parsed.profile.status,
            }
          : null,
        isActive: parsed.is_active,
        roleKeys: parsed.role_keys,
        permissionKeys: parsed.permission_keys,
        enabledModules: parsed.enabled_modules,
        mfaPolicy: {
          method: parsed.mfa_policy.method,
          enforcedRoles: parsed.mfa_policy.enforced_roles,
          optionalForOtherRoles: parsed.mfa_policy.optional_for_other_roles,
        },
        mfaRequired: parsed.mfa_required,
      }
    },
    async listFactors() {
      const { data, error } = await getSupabaseClient().auth.mfa.listFactors()
      if (error) throw safeAuthMessage()
      const totpFactors = data.all.filter((factor) => factor.factor_type === 'totp')
      return {
        verifiedTotp: totpFactors
          .filter((factor) => factor.status === 'verified')
          .map(({ id }) => ({ id })),
        unverifiedTotp: totpFactors
          .filter((factor) => factor.status === 'unverified')
          .map(({ id }) => ({ id })),
      }
    },
    async enrollTotp() {
      const client = getSupabaseClient()
      const factors = await this.listFactors()
      for (const factor of factors.unverifiedTotp) {
        const { error } = await client.auth.mfa.unenroll({ factorId: factor.id })
        if (error) throw safeAuthMessage()
      }
      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Egypro OneHub authenticator',
        issuer: 'Egypro OneHub',
      })
      if (error) throw safeAuthMessage()
      return {
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      }
    },
    async verifyTotp(factorId, code) {
      const { error } = await getSupabaseClient().auth.mfa.challengeAndVerify({
        factorId,
        code,
      })
      if (error) throw safeAuthMessage()
    },
    async getAal() {
      const { data, error } = await getSupabaseClient().auth.mfa.getAuthenticatorAssuranceLevel()
      if (error) throw safeAuthMessage()
      return data.currentLevel === 'aal2' ? 'aal2' : 'aal1'
    },
  }
}
