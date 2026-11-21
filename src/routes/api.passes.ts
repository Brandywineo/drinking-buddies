import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { profilePasses, profiles, users } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const actionSchema = z.object({ userId: z.string().uuid() }).strict()

export const Route = createFileRoute('/api/passes')({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const userId = await getAuthenticatedUserId(request)
      if (!userId) return jsonError('Sign in to pass on a profile.', 401, 'UNAUTHENTICATED')
      let body: unknown
      try { body = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
      const parsed = actionSchema.safeParse(body)
      if (!parsed.success || parsed.data.userId === userId) return jsonError('Choose a valid profile.', 400, 'INVALID_TARGET')
      const [target] = await getDb().select({ id: users.id }).from(users).innerJoin(profiles, eq(profiles.userId, users.id))
        .where(and(eq(users.id, parsed.data.userId), eq(users.status, 'active'), eq(profiles.discoverable, true))).limit(1)
      if (!target) return jsonError('That profile is not available.', 404, 'PROFILE_NOT_FOUND')
      await getDb().insert(profilePasses).values({ fromUserId: userId, toUserId: parsed.data.userId }).onConflictDoNothing()
      return jsonOk({ passed: true })
    } catch (error) {
      console.error('Pass action failed', error)
      return jsonError('We could not process that action.', 500, 'PASS_FAILED')
    }
  } } },
})
