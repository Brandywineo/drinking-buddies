import { createFileRoute } from '@tanstack/react-router'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { venuePhotos, venues } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

export const Route = createFileRoute('/api/venues/mine')({
 server:{handlers:{GET:async({request})=>{
  const userId=await getAuthenticatedUserId(request)
  if(!userId)return jsonError('Sign in to manage your venues.',401,'UNAUTHENTICATED')
  try{
   const rows=await getDb().select({
    id:venues.id,name:venues.name,approvalStatus:venues.approvalStatus,isPublished:venues.isPublished,
    area:venues.area,city:venues.city,createdAt:venues.createdAt,
    photoCount: getDb().$count(venuePhotos, eq(venuePhotos.venueId, venues.id)),
   }).from(venues).where(eq(venues.ownerId,userId)).orderBy(desc(venues.createdAt)).limit(50)
   return jsonOk({venues:rows})
  }catch(error){console.error('Owned venues lookup failed',error);return jsonError('Could not load your venues.',500,'MY_VENUES_FAILED')}
 }}}
})
