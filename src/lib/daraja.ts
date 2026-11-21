type DarajaConfig = {
  baseUrl: string
  consumerKey: string
  consumerSecret: string
  shortcode: string
  passkey: string
  callbackUrl: string
}

type DarajaResponse = Record<string, unknown>

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export function getDarajaConfig(): DarajaConfig {
  const environment = process.env.MPESA_ENV ?? 'sandbox'
  if (environment !== 'sandbox' && environment !== 'production') {
    throw new Error('MPESA_ENV must be sandbox or production')
  }
  return {
    baseUrl: environment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke',
    consumerKey: required('MPESA_CONSUMER_KEY'),
    consumerSecret: required('MPESA_CONSUMER_SECRET'),
    shortcode: required('MPESA_SHORTCODE'),
    passkey: required('MPESA_PASSKEY'),
    callbackUrl: required('MPESA_CALLBACK_URL'),
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
  if (!response.ok || typeof payload.access_token !== 'string') {
    throw new Error('Daraja OAuth token request failed')
  }
  return payload.access_token
}

async function postDaraja(path: string, body: Record<string, unknown>) {
  const config = getDarajaConfig()
  const token = await accessToken(config)
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  const payload = await response.json() as DarajaResponse
  if (!response.ok) {
    throw new Error(typeof payload.errorMessage === 'string' ? payload.errorMessage : 'Daraja request failed')
  }
  return payload
}

export function normalizeMpesaPhone(input: string) {
  const digits = input.replace(/\\D/g, '')
  const normalized = digits.startsWith('0') ? `254${digits.slice(1)}`
    : digits.startsWith('7') || digits.startsWith('1') ? `254${digits}`
      : digits
  if (!/^254[17]\\d{8}$/.test(normalized)) throw new Error('Enter a valid Kenyan M-PESA phone number')
  return normalized
}

export async function initiateStkPush(input: {
  phone: string
  amountMinor: number
  accountReference: string
  description: string
}) {
  const config = getDarajaConfig()
  if (process.env.MPESA_ENV !== 'sandbox') {
    throw new Error('Live Daraja checkout is disabled until production approval is explicitly enabled')
  }
  const timestamp = darajaTimestamp()
  const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString('base64')
  const phone = normalizeMpesaPhone(input.phone)
  const amount = Math.ceil(input.amountMinor / 100)
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('Invalid STK Push amount')

  const result = await postDaraja('/mpesa/stkpush/v1/processrequest', {
    BusinessShortCode: config.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: phone,
    PartyB: config.shortcode,
    PhoneNumber: phone,
    CallBackURL: config.callbackUrl,
    AccountReference: input.accountReference.slice(0, 12),
    TransactionDesc: input.description.slice(0, 13),
  })
  if (typeof result.CheckoutRequestID !== 'string' || typeof result.MerchantRequestID !== 'string') {
    throw new Error('Daraja did not return a checkout request reference')
  }
  return {
    checkoutRequestId: result.CheckoutRequestID,
    merchantRequestId: result.MerchantRequestID,
    customerMessage: typeof result.CustomerMessage === 'string' ? result.CustomerMessage : 'Check your phone to complete M-PESA payment.',
  }
}

export async function queryStkPush(checkoutRequestId: string) {
  const config = getDarajaConfig()
  const timestamp = darajaTimestamp()
  const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString('base64')
  return postDaraja('/mpesa/stkpushquery/v1/query', {
    BusinessShortCode: config.shortcode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  })
}
