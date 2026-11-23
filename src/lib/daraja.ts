import { withDarajaCallbackToken } from './daraja-callback-auth'
import { getMpesaSecrets } from './mpesa-secrets'

type DarajaConfig = {
  baseUrl: string
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

type DarajaResponse = Record<string, unknown>

function required(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} is not configured in Admin → M-Pesa settings`)
  return value.trim()
}

export async function getDarajaConfig(): Promise<DarajaConfig> {
  const environment = process.env.MPESA_ENV ?? 'sandbox'
  if (environment !== 'sandbox' && environment !== 'production') {
    throw new Error('MPESA_ENV must be sandbox or production')
  }
  const secrets = await getMpesaSecrets()
  return {
    baseUrl: environment === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke',
    consumerKey: required(secrets.consumerKey, 'Daraja consumer key'),
    consumerSecret: required(secrets.consumerSecret, 'Daraja consumer secret'),
    shortcode: required(secrets.shortcode, 'M-Pesa shortcode'),
    passkey: required(secrets.passkey, 'STK Push passkey'),
    callbackUrl: required(secrets.callbackUrl, 'STK callback URL'),
    callbackToken: required(secrets.callbackToken, 'Callback security token'),
    b2cInitiatorName: secrets.b2cInitiatorName,
    b2cSecurityCredential: secrets.b2cSecurityCredential,
    b2cResultUrl: secrets.b2cResultUrl,
    b2cTimeoutUrl: secrets.b2cTimeoutUrl,
    reversalInitiatorName: secrets.reversalInitiatorName,
    reversalSecurityCredential: secrets.reversalSecurityCredential,
    reversalReceiverParty: secrets.reversalReceiverParty,
    reversalIdentifierType: secrets.reversalIdentifierType,
    reversalResultUrl: secrets.reversalResultUrl,
    reversalTimeoutUrl: secrets.reversalTimeoutUrl,
  }
}

function darajaTimestamp() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`
}

async function accessToken(config: DarajaConfig) {
  const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64')
  const response = await fetch(`${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
    signal: AbortSignal.timeout(15_000),
  })
  const payload = await response.json() as DarajaResponse
  if (!response.ok || typeof payload.access_token !== 'string') throw new Error('Daraja OAuth token request failed')
  return payload.access_token
}

async function postDaraja(path: string, body: Record<string, unknown>) {
  const config = await getDarajaConfig()
  const token = await accessToken(config)
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  const payload = await response.json() as DarajaResponse
  if (!response.ok) throw new Error(typeof payload.errorMessage === 'string' ? payload.errorMessage : 'Daraja request failed')
  return payload
}

export function normalizeMpesaPhone(input: string) {
  const digits = input.replace(/\D/g, '')
  const normalized = digits.startsWith('0') ? `254${digits.slice(1)}`
    : digits.startsWith('7') || digits.startsWith('1') ? `254${digits}`
      : digits
  if (!/^254[17]\d{8}$/.test(normalized)) throw new Error('Enter a valid Kenyan M-PESA phone number')
  return normalized
}

export async function initiateStkPush(input: { phone: string; amountMinor: number; accountReference: string; description: string }) {
  const config = await getDarajaConfig()
  if ((process.env.MPESA_ENV ?? 'sandbox') !== 'sandbox') throw new Error('Live Daraja checkout is disabled until production approval is explicitly enabled')
  const timestamp = darajaTimestamp()
  const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString('base64')
  const phone = normalizeMpesaPhone(input.phone)
  if (input.amountMinor % 100 !== 0) throw new Error('M-PESA KES payments must be whole shillings')
  const amount = input.amountMinor / 100
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('Invalid STK Push amount')
  const callbackUrl = await withDarajaCallbackToken(config.callbackUrl, config.callbackToken)
  const result = await postDaraja('/mpesa/stkpush/v1/processrequest', {
    BusinessShortCode: config.shortcode, Password: password, Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline', Amount: amount, PartyA: phone, PartyB: config.shortcode,
    PhoneNumber: phone, CallBackURL: callbackUrl, AccountReference: input.accountReference.slice(0, 12),
    TransactionDesc: input.description.slice(0, 13),
  })
  if (typeof result.CheckoutRequestID !== 'string' || typeof result.MerchantRequestID !== 'string') {
    throw new Error('Daraja did not return a checkout request reference')
  }
  return {
    checkoutRequestId: result.CheckoutRequestID, merchantRequestId: result.MerchantRequestID,
    customerMessage: typeof result.CustomerMessage === 'string' ? result.CustomerMessage : 'Check your phone to complete M-PESA payment.',
  }
}

export async function queryStkPush(checkoutRequestId: string) {
  const config = await getDarajaConfig()
  const timestamp = darajaTimestamp()
  const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString('base64')
  return postDaraja('/mpesa/stkpushquery/v1/query', {
    BusinessShortCode: config.shortcode, Password: password, Timestamp: timestamp, CheckoutRequestID: checkoutRequestId,
  })
}

export async function initiateB2CPayout(input: { phone: string; amountMinor: number; reference: string }) {
  if (process.env.MPESA_ENV !== 'sandbox') throw new Error('Live B2C payouts are disabled')
  const config = await getDarajaConfig()
  const initiator = required(config.b2cInitiatorName, 'B2C initiator name')
  const securityCredential = required(config.b2cSecurityCredential, 'B2C security credential')
  const resultUrl = await withDarajaCallbackToken(required(config.b2cResultUrl, 'B2C result URL'), config.callbackToken)
  const timeoutUrl = await withDarajaCallbackToken(required(config.b2cTimeoutUrl, 'B2C timeout URL'), config.callbackToken)
  if (!resultUrl.startsWith('https://') || !timeoutUrl.startsWith('https://')) throw new Error('Daraja B2C callback URLs must use HTTPS')
  if (input.amountMinor % 100 !== 0) throw new Error('M-PESA B2C amount must be whole shillings')
  const amount = input.amountMinor / 100
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('Invalid B2C amount')
  const result = await postDaraja('/mpesa/b2c/v3/paymentrequest', {
    OriginatorConversationID: input.reference, InitiatorName: initiator, SecurityCredential: securityCredential,
    CommandID: 'BusinessPayment', Amount: amount, PartyA: config.shortcode, PartyB: normalizeMpesaPhone(input.phone),
    Remarks: 'Marketplace host payout', QueueTimeOutURL: timeoutUrl, ResultURL: resultUrl, Occasion: 'Host payout',
  })
  if (typeof result.ConversationID !== 'string' || typeof result.OriginatorConversationID !== 'string') {
    throw new Error('Daraja did not return B2C conversation references')
  }
  return {
    conversationId: result.ConversationID, originatorConversationId: result.OriginatorConversationID,
    responseDescription: typeof result.ResponseDescription === 'string' ? result.ResponseDescription : 'Payout request accepted for processing',
  }
}

export async function initiateReversal(input: { transactionId: string; amountMinor: number; reference: string }) {
  if (process.env.MPESA_ENV !== 'sandbox') throw new Error('Live M-PESA reversals are disabled')
  const config = await getDarajaConfig()
  const initiator = required(config.reversalInitiatorName, 'Reversal initiator name')
  const securityCredential = required(config.reversalSecurityCredential, 'Reversal security credential')
  const receiverParty = required(config.reversalReceiverParty, 'Reversal receiver party')
  const receiverIdentifierType = required(config.reversalIdentifierType, 'Reversal identifier type')
  const resultUrl = await withDarajaCallbackToken(required(config.reversalResultUrl, 'Reversal result URL'), config.callbackToken)
  const timeoutUrl = await withDarajaCallbackToken(required(config.reversalTimeoutUrl, 'Reversal timeout URL'), config.callbackToken)
  if (!resultUrl.startsWith('https://') || !timeoutUrl.startsWith('https://')) throw new Error('Daraja reversal callback URLs must use HTTPS')
  if (input.amountMinor % 100 !== 0) throw new Error('M-PESA reversal amount must be whole shillings')
  const amount = input.amountMinor / 100
  const result = await postDaraja('/mpesa/reversal/v1/request', {
    Initiator: initiator, SecurityCredential: securityCredential, CommandID: 'TransactionReversal',
    TransactionID: input.transactionId, Amount: amount, ReceiverParty: receiverParty,
    ReceiverIdentifierType: receiverIdentifierType, ResultURL: resultUrl, QueueTimeOutURL: timeoutUrl,
    Remarks: 'Meetup booking refund', Occasion: input.reference.slice(0, 30),
  })
  if (typeof result.ConversationID !== 'string' || typeof result.OriginatorConversationID !== 'string') {
    throw new Error('Daraja did not return reversal conversation references')
  }
  return { conversationId: result.ConversationID, originatorConversationId: result.OriginatorConversationID }
}
