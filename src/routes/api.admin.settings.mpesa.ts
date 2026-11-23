import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { platformSettings } from '../db/schema'
import { getAdminUserId } from '../lib/admin'
import { jsonError, jsonOk } from '../lib/http'

const bodySchema = z.object({ enabled: z.boolean() }).strict()

function readiness() {
  const callbackUrl = process.env.MPESA_CALLBACK_URL?.trim() ?? ''
  const callbackToken = process.env.MPESA_CALLBACK_TOKEN?.trim() ?? ''
  const checks = {
    consumerKey: Boolean(process.env.MPESA_CONSUMER_KEY?.trim()),
    consumerSecret: Boolean(process.env.MPESA_CONSUMER_SECRET?.trim()),
    shortcode: Boolean(process.env.MPESA_SHORTCODE?.trim()),
    passkey: Boolean(process.env.MPESA_PASSKEY?.trim()),
    callbackUrl: callbackUrl.startsWith('https://'),
    callbackToken: callbackToken.length >= 32,
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
      const status = readiness()
      return jsonOk({
        enabled: value.enabled === true,
        environment: process.env.MPESA_ENV ?? 'sandbox',
        ...status,
      })
    },
    PUT: async ({ request }) => {
      const adminId = await getAdminUserId(request)
      if (!adminId) return jsonError('Admin access required.', 403, 'ADMIN_REQUIRED')
      let raw: unknown
      try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
      const parsed = bodySchema.safeParse(raw)
      if (!parsed.success) return jsonError('Invalid M-Pesa setting.', 400, 'INVALID_SETTING')
      const status = readiness()
      if (parsed.data.enabled && !status.ready) {
        return jsonError('M-Pesa cannot be enabled until all sandbox credentials and secure HTTPS callback settings are configured.', 409, 'MPESA_NOT_READY')
      }
      const value = { enabled: parsed.data.enabled }
      await getDb().insert(platformSettings).values({ key: 'mpesa_settings', value, updatedBy: adminId })
        .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedBy: adminId, updatedAt: new Date() } })
      return jsonOk({ saved: true, enabled: parsed.data.enabled })
    },
  } },
})
