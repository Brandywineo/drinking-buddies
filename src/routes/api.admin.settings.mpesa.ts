import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { platformSettings } from '../db/schema'
import { getAdminUserId } from '../lib/admin'
import { jsonError, jsonOk } from '../lib/http'
import { createOpaqueToken } from '../lib/crypto'
import { encryptMpesaSecrets, getMpesaSecrets, isMpesaEncryptionReady, mpesaSecretFields, type MpesaSecrets } from '../lib/mpesa-secrets'

const credentialsSchema = z.object({
  consumerKey: z.string().trim().max(500).optional(),
  consumerSecret: z.string().trim().max(500).optional(),
  shortcode: z.string().trim().max(40).optional(),
  passkey: z.string().trim().max(500).optional(),
  callbackUrl: z.string().trim().max(500).optional(),
  callbackToken: z.string().trim().max(500).optional(),
  b2cInitiatorName: z.string().trim().max(120).optional(),
  b2cSecurityCredential: z.string().trim().max(2000).optional(),
  b2cResultUrl: z.string().trim().max(500).optional(),
  b2cTimeoutUrl: z.string().trim().max(500).optional(),
  reversalInitiatorName: z.string().trim().max(120).optional(),
  reversalSecurityCredential: z.string().trim().max(2000).optional(),
  reversalReceiverParty: z.string().trim().max(120).optional(),
  reversalIdentifierType: z.string().trim().max(20).optional(),
  reversalResultUrl: z.string().trim().max(500).optional(),
  reversalTimeoutUrl: z.string().trim().max(500).optional(),
}).strict()

const bodySchema = z.object({
  enabled: z.boolean().optional(),
  credentials: credentialsSchema.optional(),
}).strict().refine((value) => value.enabled !== undefined || value.credentials !== undefined)

function statusFor(secrets: MpesaSecrets) {
  const checks = {
    consumerKey: Boolean(secrets.consumerKey),
    consumerSecret: Boolean(secrets.consumerSecret),
    shortcode: Boolean(secrets.shortcode),
    passkey: Boolean(secrets.passkey),
    callbackUrl: secrets.callbackUrl.startsWith('https://'),
    callbackToken: secrets.callbackToken.length >= 32,
  }
  return { checks, ready: Object.values(checks).every(Boolean) && (process.env.MPESA_ENV ?? 'sandbox') === 'sandbox' }
}

export const Route = createFileRoute('/api/admin/settings/mpesa')({
  server: { handlers: {
    GET: async ({ request }) => {
      if (!await getAdminUserId(request)) return jsonError('Admin access required.', 403, 'ADMIN_REQUIRED')
      const [setting] = await getDb().select({ value: platformSettings.value }).from(platformSettings)
        .where(eq(platformSettings.key, 'mpesa_settings')).limit(1)
      const value = setting?.value && typeof setting.value === 'object' ? setting.value as Record<string, unknown> : {}
      const secrets = await getMpesaSecrets()
      const status = statusFor(secrets)
      return jsonOk({
        enabled: value.enabled === true,
        environment: process.env.MPESA_ENV ?? 'sandbox',
        encryptionReady: isMpesaEncryptionReady(),
        configured: Object.fromEntries(mpesaSecretFields().map((field) => [field, Boolean(secrets[field])])),
        ...status,
      })
    },
    PUT: async ({ request }) => {
      const adminId = await getAdminUserId(request)
      if (!adminId) return jsonError('Admin access required.', 403, 'ADMIN_REQUIRED')
      let raw: unknown
      try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
      const parsed = bodySchema.safeParse(raw)
      if (!parsed.success) return jsonError('Invalid M-Pesa configuration.', 400, 'INVALID_SETTING')
      if (parsed.data.credentials && !isMpesaEncryptionReady()) {
        return jsonError('The server APP_ENCRYPTION_KEY must be configured once before Daraja credentials can be saved.', 503, 'ENCRYPTION_KEY_MISSING')
      }

      const db = getDb()
      let secrets = await getMpesaSecrets()
      if (parsed.data.credentials) {
        const updates = parsed.data.credentials
        secrets = {
          ...secrets,
          ...Object.fromEntries(Object.entries(updates).filter(([, value]) => typeof value === 'string' && value.trim().length > 0)),
        } as MpesaSecrets
        if (!secrets.callbackUrl) {
          const appUrl = process.env.APP_URL?.trim() ?? ''
          secrets.callbackUrl = appUrl ? new URL('/api/webhooks/daraja', appUrl).toString() : ''
        }
        if (!secrets.callbackToken) secrets.callbackToken = createOpaqueToken(32)
        if (secrets.callbackUrl && !secrets.callbackUrl.startsWith('https://')) {
          return jsonError('Daraja callback URLs must use HTTPS.', 400, 'HTTPS_REQUIRED')
        }
        const encrypted = encryptMpesaSecrets(secrets)
        await db.insert(platformSettings).values({ key: 'mpesa_credentials', value: { encrypted, version: 1 }, updatedBy: adminId })
          .onConflictDoUpdate({ target: platformSettings.key, set: { value: { encrypted, version: 1 }, updatedBy: adminId, updatedAt: new Date() } })
      }

      const [current] = await db.select({ value: platformSettings.value }).from(platformSettings)
        .where(eq(platformSettings.key, 'mpesa_settings')).limit(1)
      const currentValue = current?.value && typeof current.value === 'object' ? current.value as Record<string, unknown> : {}
      const enabled = parsed.data.enabled ?? currentValue.enabled === true
      const status = statusFor(secrets)
      if (enabled && !status.ready) {
        return jsonError('M-Pesa checkout cannot be enabled until the sandbox credentials and secure HTTPS callback settings are complete.', 409, 'MPESA_NOT_READY')
      }
      const value = { enabled }
      await db.insert(platformSettings).values({ key: 'mpesa_settings', value, updatedBy: adminId })
        .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedBy: adminId, updatedAt: new Date() } })
      return jsonOk({ saved: true, enabled, ready: status.ready })
    },
  } },
})
