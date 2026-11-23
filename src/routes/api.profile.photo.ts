import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { profiles } from '../db/schema'
import { storeCommunityFile } from '../lib/community-media'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError,jsonOk } from '../lib/http'
export const Route=createFileRoute('/api/profile/photo')({server:{handlers:{POST:async({request})=>{
 const userId=await getAuthenticatedUserId(request);if(!userId)return jsonError('Sign in to upload a profile photo.',401,'UNAUTHENTICATED')
 try{const form=await request.formData();const file=form.get('file');if(!(file instanceof File))return jsonError('Choose a JPG, PNG or WebP photo.',400,'PHOTO_REQUIRED');const stored=await storeCommunityFile(file,false);const [profile]=await getDb().update(profiles).set({avatarUrl:stored.key,updatedAt:new Date()}).where(eq(profiles.userId,userId)).returning({userId:profiles.userId});if(!profile)return jsonError('Create your profile before uploading a photo.',409,'PROFILE_REQUIRED');return jsonOk({avatarUrl:'/api/profile/photo/'+userId})}catch(error){return jsonError(error instanceof Error&&/Use JPG|smaller|does not match/.test(error.message)?error.message:'We could not save your profile photo.',400,'PHOTO_UPLOAD_FAILED')}
}}}}})