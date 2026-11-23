import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { platformSettings } from '../db/schema'
import { getAdminUserId } from '../lib/admin'
import { jsonError, jsonOk } from '../lib/http'
const schema = z.object({ required: z.boolean() }).strict()
export const Route = createFileRoute('/api/admin/settings/email-verification')({
 server: { handlers: {
  GET: async ({ request }) => {
   if (!await getAdminUserId(request)) return jsonError('Admin access required.',403,'ADMIN_REQUIRED')
   const [setting]=await getDb().select({value:platformSettings.value}).from(platformSettings).where(eq(platformSettings.key,'email_verification')).limit(1)
   const required=Boolean(setting?.value && typeof setting.value==='object' && (setting.value as {required?:unknown}).required===true)
   return jsonOk({required})
  },
  PUT: async ({request}) => {
   const adminId=await getAdminUserId(request)
   if(!adminId)return jsonError('Admin access required.',403,'ADMIN_REQUIRED')
   let raw:unknown
   try{raw=await request.json()}catch{return jsonError('Request body must be valid JSON.',400,'INVALID_JSON')}
   const parsed=schema.safeParse(raw)
   if(!parsed.success)return jsonError('Invalid verification setting.',400,'INVALID_SETTING')
   await getDb().insert(platformSettings).values({key:'email_verification',value:{required:parsed.data.required},updatedBy:adminId})
    .onConflictDoUpdate({target:platformSettings.key,set:{value:{required:parsed.data.required},updatedBy:adminId,updatedAt:new Date()}})
   return jsonOk({saved:true,required:parsed.data.required})
  }
 }}
})
