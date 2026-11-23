import {createFileRoute} from '@tanstack/react-router'
import {and,eq} from 'drizzle-orm'
import {z} from 'zod'
import {getDb} from '../db'
import {consumerMemberships,payments,platformSettings,users} from '../db/schema'
import {getAuthenticatedUserId} from '../lib/session'
import {jsonError,jsonOk} from '../lib/http'
import {initiateStkPush,normalizeMpesaPhone} from '../lib/daraja'
const schema=z.object({plan:z.enum(['plus_monthly','plus_annual']),phone:z.string().min(9).max(20)}).strict()
export const Route=createFileRoute('/api/consumer/subscription/checkout')({server:{handlers:{POST:async({request})=>{try{
const userId=await getAuthenticatedUserId(request);if(!userId)return jsonError('Sign in to purchase Consumer Plus.',401,'UNAUTHENTICATED')
let raw:unknown;try{raw=await request.json()}catch{return jsonError('Invalid JSON.',400,'INVALID_JSON')}
const parsed=schema.safeParse(raw);if(!parsed.success)return jsonError('Choose a valid Consumer Plus plan.',400,'INVALID_PLAN')
const db=getDb(),phone=normalizeMpesaPhone(parsed.data.phone),[user]=await db.select().from(users).where(eq(users.id,userId)).limit(1)
if(!user?.phoneVerifiedAt||!user.phoneE164||normalizeMpesaPhone(user.phoneE164)!==phone)return jsonError('Use the M-PESA number verified on your account.',403,'VERIFIED_MPESA_NUMBER_REQUIRED')
const [setting]=await db.select({value:platformSettings.value}).from(platformSettings).where(eq(platformSettings.key,'consumer_membership')).limit(1),config=setting?.value&&typeof setting.value==='object'?setting.value as Record<string,unknown>:{}
const interval=parsed.data.plan==='plus_annual'?'year':'month',amountMinor=Number(interval==='year'?config.annualPriceMinor:config.monthlyPriceMinor)
if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor%100!==0)return jsonError('Consumer Plus pricing is not configured.',409,'PRICE_NOT_CONFIGURED')
const now=new Date();let [sub]=await db.select().from(consumerMemberships).where(eq(consumerMemberships.userId,userId)).limit(1)
if(sub?.status==='active'&&sub.currentPeriodEnd.getTime()>now.getTime()+7*86400000)return jsonError('Your membership is active. Renewal opens during the final 7 days.',409,'MEMBERSHIP_ACTIVE')
if(!sub){const end=new Date(now);if(interval==='year')end.setFullYear(end.getFullYear()+1);else end.setMonth(end.getMonth()+1);[sub]=await db.insert(consumerMemberships).values({userId,plan:parsed.data.plan,status:'trialing',lockedPriceMinor:amountMinor,currency:'KES',billingInterval:interval,currentPeriodStart:now,currentPeriodEnd:end}).returning()}
const [pending]=await db.select().from(payments).where(and(eq(payments.consumerSubscriptionId,sub.id),eq(payments.provider,'daraja'),eq(payments.status,'pending'))).limit(1)
if(pending&&typeof pending.metadata.checkoutRequestId==='string')return jsonOk({paymentId:pending.id,status:'pending',checkoutRequestId:pending.metadata.checkoutRequestId,reused:true})
const [payment]=await db.insert(payments).values({userId,consumerSubscriptionId:sub.id,provider:'daraja',amountMinor,currency:'KES',status:'pending',idempotencyKey:'consumer-membership:'+sub.id+':'+crypto.randomUUID(),metadata:{purpose:'consumer_subscription',phone,billingInterval:interval,plan:parsed.data.plan}}).returning()
if(!payment)return jsonError('Could not create payment.',500,'PAYMENT_CREATE_FAILED')
const stk=await initiateStkPush({phone,amountMinor,accountReference:'DBPLUS'+sub.id.replace(/-/g,'').slice(0,8),description:'Consumer Plus membership'})
await db.update(payments).set({providerReference:stk.checkoutRequestId,metadata:{purpose:'consumer_subscription',phone,billingInterval:interval,plan:parsed.data.plan,checkoutRequestId:stk.checkoutRequestId,merchantRequestId:stk.merchantRequestId,environment:stk.environment},updatedAt:new Date()}).where(eq(payments.id,payment.id))
return jsonOk({paymentId:payment.id,status:'pending',customerMessage:stk.customerMessage},201)
}catch(error){console.error('Consumer Plus checkout failed',error);return jsonError('We could not start Consumer Plus checkout.',502,'MEMBERSHIP_CHECKOUT_FAILED')}}}}})