import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { platformSettings } from '../db/schema'

export type MpesaSecrets = {
  consumerKey: string
  consumerSecret: string
  shortcode: string
  passkey: string
  callbackUrl: string
  callbackToken: string
  b2cInitiatorName: string
  b2cSecurityCredential: string
  b2cResultUrl: string
  b2cTimeoutUrl: string
  reversalInitiatorName: string
  reversalSecurityCredential: string
  reversalReceiverParty: string
  reversalIdentifierType: string
  reversalResultUrl: string
  reversalTimeoutUrl: string
}

const fields: (keyof MpesaSecrets)[] = [
  'consumerKey', 'consumerSecret', 'shortcode', 'passkey', 'callbackUrl', 'callbackToken',
  'b2cInitiatorName', 'b2cSecurityCredential', 'b2cResultUrl', 'b2cTimeoutUrl',
  'reversalInitiatorName', 'reversalSecurityCredential', 'reversalReceiverParty',
  'reversalIdentifierType', 'reversalResultUrl', 'reversalTimeoutUrl',
]

const envNames: Record<keyof MpesaSecrets, string> = {
  consumerKey: 'MPESA_CONSUMER_KEY',
  consumerSecret: 'MPESA_CONSUMER_SECRET',
  shortcode: 'MPESA_SHORTCODE',
  passkey: 'MPESA_PASSKEY',
  callbackUrl: 'MPESA_CALLBACK_URL',
  callbackToken: 'MPESA_CALLBACK_TOKEN',
  b2cInitiatorName: 'MPESA_B2C_INITIATOR_NAME',
  b2cSecurityCredential: 'MPESA_B2C_SECURITY_CREDENTIAL',
  b2cResultUrl: 'MPESA_B2C_RESULT_URL',
  b2cTimeoutUrl: 'MPESA_B2C_TIMEOUT_URL',
  reversalInitiatorName: 'MPESA_REVERSAL_INITIATOR_NAME',
  reversalSecurityCredential: 'MPESA_REVERSAL_SECURITY_CREDENTIAL',
  reversalReceiverParty: 'MPESA_REVERSAL_RECEIVER_PARTY',
  reversalIdentifierType: 'MPESA_REVERSAL_IDENTIFIER_TYPE',
  reversalResultUrl: 'MPESA_REVERSAL_RESULT_URL',
  reversalTimeoutUrl: 'MPESA_REVERSAL_TIMEOUT_URL',
}

function encryptionKey() {
  const configured = process.env.APP_ENCRYPTION_KEY?.trim()
  if (!configured) throw new Error('APP_ENCRYPTION_KEY is not configured on the server')
  const decoded = Buffer.from(configured, 'base64')
  return decoded.length === 32 ? decoded : createHash('sha256').update(configured).digest()
}

export function isMpesaEncryptionReady() {
  return Boolean(process.env.APP_ENCRYPTION_KEY?.trim())
}

export function encryptMpesaSecrets(value: MpesaSecrets) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}

function decryptMpesaSecrets(value: string): MpesaSecrets {
  const [ivPart, tagPart, encryptedPart] = value.split('.')
  if (!ivPart || !tagPart || !encryptedPart) throw new Error('Stored M-Pesa credentials are invalid')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivPart, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedPart, 'base64url')), decipher.final()])
  const parsed = JSON.parse(decrypted.toString('utf8')) as Partial<MpesaSecrets>
  return Object.fromEntries(fields.map((field) => [field, typeof parsed[field] === 'string' ? parsed[field] : ''])) as MpesaSecrets
}

export async function getMpesaSecrets(): Promise<MpesaSecrets> {
  const [stored] = await getDb().select({ value: platformSettings.value }).from(platformSettings)
    .where(eq(platformSettings.key, 'mpesa_credentials')).limit(1)
  const storedValue = stored?.value && typeof stored.value === 'object' ? stored.value as { encrypted?: unknown } : null
  if (typeof storedValue?.encrypted === 'string') {
    const decrypted = decryptMpesaSecrets(storedValue.encrypted)
    return Object.fromEntries(fields.map((field) => [
      field,
      decrypted[field] || process.env[envNames[field]]?.trim() || '',
    ])) as MpesaSecrets
  }
  return Object.fromEntries(fields.map((field) => [field, process.env[envNames[field]]?.trim() || ''])) as MpesaSecrets
}

export function mpesaSecretFields() {
  return [...fields]
}
