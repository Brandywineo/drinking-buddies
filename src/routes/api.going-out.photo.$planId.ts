import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { goingOutPlans } from '../db/schema'
import { readCommunityFile } from '../lib/community-media'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError } from '../lib/http'

export const Route = createFileRoute('/api/going-out/photo/$planId')({ server: { handlers: { GET: async ({ request, params }) => {
  try {
    const userId = await getAuthenticatedUserId(request)
    if (!userId) return jsonError('Sign in to view appearance photos.', 401, 'UNAUTHENTICATED')
    const [plan] = await getDb().select().from(goingOutPlans).where(eq(goingOutPlans.id, params.planId)).limit(1)
    if (!plan?.appearancePhotoKey || (plan.userId !== userId && (plan.status !== 'active' || plan.endsAt <= new Date()))) return jsonError('Photo not found.', 404, 'PHOTO_NOT_FOUND')
    const bytes = await readCommunityFile(plan.appearancePhotoKey)
    const ext = plan.appearancePhotoKey.split('.').pop()
    const contentType = ext === 'mp4' ? 'video/mp4' : ext === 'mov' ? 'video/quicktime' : ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/webp'
    return new Response(bytes, { headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' } })
  } catch { return jsonError('Photo not found.', 404, 'PHOTO_NOT_FOUND') }
} } } })
