import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { memoryTags } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const schema = z.object({ decision: z.enum(['accept','decline']) }).strict()

export const Route = createFileRoute('/api/memories/tags/$tagId')({
  server: { handlers: {
    PATCH: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to respond to tag requests.', 401, 'UNAUTHENTICATED')
        const id = z.string().uuid().safeParse(params.tagId)
        if (!id.success) return jsonError('Invalid tag request.', 400, 'INVALID_TAG')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = schema.safeParse(raw)
        if (!parsed.success) return jsonError('Choose accept or decline.', 400, 'INVALID_DECISION')
        const [tag] = await getDb().update(memoryTags).set({
          status: parsed.data.decision === 'accept' ? 'accepted' : 'declined',
        }).where(and(eq(memoryTags.id, id.data), eq(memoryTags.taggedUserId, userId), eq(memoryTags.status, 'pending')))
          .returning({ id: memoryTags.id, status: memoryTags.status })
        if (!tag) return jsonError('Tag request not found.', 404, 'TAG_NOT_FOUND')
        return jsonOk({ tag })
      } catch (error) {
        console.error('Memory tag response failed', error)
        return jsonError('We could not update this tag request.', 500, 'TAG_UPDATE_FAILED')
      }
    },
  } },
})
