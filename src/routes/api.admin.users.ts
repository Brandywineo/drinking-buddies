import { createFileRoute } from '@tanstack/react-router'
import { desc,eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { profiles,users } from '../db/schema'
import { getAdminUserId } from '../lib/admin'
import { jsonError,jsonOk } from '../lib/http'
const schema=z.object({userId:z.string().uuid(),status:z.enum(['active','suspended']).optional(),markEmailVerified:z.boolean().optional()}).strict().refine(v=>Number(v.status!==undefined)+Number(v.markEmailVerified!==undefined)===1)
export const Route=createFileRoute('/api/admin/users')({server:{handlers:{
 GET:async({request})=>{
  if(!await getAdminUserId(request))return jsonError('Admin access required.',403,'ADMIN_REQUIRED')
  const rows=await getDb().select({id:users.id,email:users.email,status:users.status,emailVerifiedAt:users.emailVerifiedAt,createdAt:users.createdAt,displayName:profiles.displayName})
   .from(users).leftJoin(profiles,eq(profiles.userId,users.id)).orderBy(desc(users.createdAt)).limit(200)
  return jsonOk({users:rows})
 },
 PATCH:async({request})=>{
  const adminId=await getAdminUserId(request)
  if(!adminId)return jsonError('Admin access required.',403,'ADMIN_REQUIRED')
  let raw:unknown
  try{raw=await request.json()}catch{return jsonError('Request body must be valid JSON.',400,'INVALID_JSON')}
  const parsed=schema.safeParse(raw)
  if(!parsed.success)return jsonError('Invalid user update.',400,'INVALID_USER_UPDATE')
  if(parsed.data.userId===adminId&&parsed.data.status==='suspended')return jsonError('You cannot suspend your own administrator account.',400,'CANNOT_SUSPEND_SELF')
  const values=parsed.data.status
   ? {status:parsed.data.status,updatedAt:new Date()}
   : {emailVerifiedAt:new Date(),status:'active' as const,updatedAt:new Date()}
  const [updated]=await getDb().update(users).set(values).where(eq(users.id,parsed.data.userId)).returning({id:users.id,status:users.status,emailVerifiedAt:users.emailVerifiedAt})
  if(!updated)return jsonError('User not found.',404,'USER_NOT_FOUND')
  return jsonOk({user:updated})
 }
}}})
