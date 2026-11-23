import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../../db'
import { venuePhotos } from '../../../db/schema'
import { getAdminUserId } from '../../../lib/admin'
import { readCommunityFile } from '../../../lib/community-media'
import { jsonError } from '../../../lib/http'

export const Route = createFileRoute('/api/admin/venue-photos/$photoId')({
 server:{handlers:{GET:async({request,params})=>{
  if(!await getAdminUserId(request))return jsonError('Admin access required.',403,'ADMIN_REQUIRED')
  const id=z.string().uuid().safeParse(params.photoId)
  if(!id.success)return jsonError('Invalid photo.',400,'INVALID_PHOTO')
  try{
   const [photo]=await getDb().select({storageKey:venuePhotos.storageKey,mimeType:venuePhotos.mimeType}).from(venuePhotos).where(eq(venuePhotos.id,id.data)).limit(1)
   if(!photo)return jsonError('Photo not found.',404,'PHOTO_NOT_FOUND')
   const bytes=await readCommunityFile(photo.storageKey)
   return new Response(bytes,{headers:{'Content-Type':photo.mimeType,'Content-Length':String(bytes.byteLength),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
  }catch(error){console.error('Admin venue photo preview failed',error);return jsonError('Could not load photo.',404,'PHOTO_NOT_FOUND')}
 }}}
})
