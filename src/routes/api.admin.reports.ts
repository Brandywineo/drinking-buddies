import { createFileRoute } from '@tanstack/react-router'
import { desc,eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { profiles,userReports,users } from '../db/schema'
import { getAdminUserId } from '../lib/admin'
import { jsonError,jsonOk } from '../lib/http'
const schema=z.object({reportId:z.string().uuid(),status:z.enum(['open','reviewing','resolved','dismissed'])}).strict()
export const Route=createFileRoute('/api/admin/reports')({server:{handlers:{
 GET:async({request})=>{
  if(!await getAdminUserId(request))return jsonError('Admin access required.',403,'ADMIN_REQUIRED')
  const rows=await getDb().select({id:userReports.id,reporterId:userReports.reporterId,reporterEmail:users.email,reporterName:profiles.displayName,reportedUserId:userReports.reportedUserId,contentType:userReports.contentType,contentId:userReports.contentId,reason:userReports.reason,details:userReports.details,status:userReports.status,createdAt:userReports.createdAt})
   .from(userReports).innerJoin(users,eq(users.id,userReports.reporterId)).leftJoin(profiles,eq(profiles.userId,userReports.reporterId)).orderBy(desc(userReports.createdAt)).limit(200)
  return jsonOk({reports:rows})
 },
 PATCH:async({request})=>{
  const adminId=await getAdminUserId(request)
  if(!adminId)return jsonError('Admin access required.',403,'ADMIN_REQUIRED')
  let raw:unknown
  try{raw=await request.json()}catch{return jsonError('Request body must be valid JSON.',400,'INVALID_JSON')}
  const parsed=schema.safeParse(raw)
  if(!parsed.success)return jsonError('Invalid moderation update.',400,'INVALID_REPORT_UPDATE')
  const [updated]=await getDb().update(userReports).set({status:parsed.data.status,updatedAt:new Date()}).where(eq(userReports.id,parsed.data.reportId)).returning({id:userReports.id,status:userReports.status})
  if(!updated)return jsonError('Report not found.',404,'REPORT_NOT_FOUND')
  return jsonOk({report:updated})
 }
}}})
