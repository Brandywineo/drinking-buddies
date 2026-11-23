import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { profiles,users } from '../db/schema'
import { readCommunityFile } from '../lib/community-media'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError } from '../lib/http'
export const Route=createFileRoute('/api/profile/photo/$userId')({server:{handlers:{GET:async({request,params})=>{
 const viewerId=await getAuthenticatedUserId(request);if(!viewerId)return jsonError('Sign in to view profile photos.',401,'UNAUTHENTICATED')
 const [profile]=await getDb().select({avatarUrl:profiles.avatarUrl,discoverable:profiles.discoverable,userStatus:users.status}).from(profiles).innerJoin(users,eq(users.id,profiles.userId)).where(eq(profiles.userId,params.userId)).limit(1)
 if(!profile||!profile.avatarUrl||profile.userStatus!=='active'||(viewerId!==params.userId&&!profile.discoverable))return jsonError('Photo not found.',404,'PHOTO_NOT_FOUND')
 try{const bytes=await readCommunityFile(profile.avatarUrl);const ext=profile.avatarUrl.split('.').pop();const type=ext==='jpg'?'image/jpeg':ext==='png'?'image/png':'image/webp';return new Response(bytes,{headers:{'Content-Type':type,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}})}catch{return jsonError('Photo not found.',404,'PHOTO_NOT_FOUND')}
}}}})