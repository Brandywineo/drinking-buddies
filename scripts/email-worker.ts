import 'dotenv/config'
import postgres from 'postgres'
import { createTransport } from 'nodemailer'

type EmailJob = {
  id: string
  recipient: string
  template_key: string
  payload: Record<string, unknown>
  attempts: number
}

const databaseUrl = process.env.DATABASE_URL
const smtpHost = process.env.SMTP_HOST
const smtpPort = Number(process.env.SMTP_PORT ?? 587)
const emailFrom = process.env.EMAIL_FROM

if (!databaseUrl || !smtpHost || !emailFrom) {
  throw new Error('DATABASE_URL, SMTP_HOST and EMAIL_FROM are required to run the email worker.')
}

const sql = postgres(databaseUrl, { max: 2, prepare: false })
const transport = createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  } : undefined,
})

let stopping = false
process.on('SIGINT', () => { stopping = true })
process.on('SIGTERM', () => { stopping = true })

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character)
}

function render(job: EmailJob) {
  const name = escapeHtml(String(job.payload.displayName ?? 'there'))
  if (job.template_key === 'verify_email') {
    const url = String(job.payload.verificationUrl ?? '')
    if (!url.startsWith(process.env.APP_URL ?? 'http://localhost:3000')) {
      throw new Error('Verification URL does not match APP_URL.')
    }
    return {
      subject: 'Verify your Drinking Buddies email',
      text: `Hi ${name}, verify your email to activate your Drinking Buddies account: ${url}\n\nThis link expires in 24 hours.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#202515"><h1>Welcome to Drinking Buddies</h1><p>Hi ${name},</p><p>One quick step: verify your email address to activate your account.</p><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;background:#d8f36a;color:#202515;text-decoration:none;border-radius:6px;font-weight:bold">Verify email</a></p><p style="color:#666;font-size:13px">This link expires in 24 hours. If you did not create this account, you can ignore this email.</p><p style="color:#888;font-size:12px">Drinking Buddies is an 18+ community.</p></div>`,
    }
  }

  if (job.template_key === 'host_membership_renewal') {
    const renewsAt = escapeHtml(String(job.payload.renewsAt ?? 'soon'))
    const url = process.env.APP_URL ?? 'http://localhost:3000'
    return {
      subject: 'Your Drinking Buddies host membership is ending soon',
      text: 'Hi ' + name + ', your host membership period ends on ' + renewsAt + '. Renew before it expires to continue publishing paid meetups. Sign in at ' + url + '.',
      html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#202515"><h1>Host membership renewal</h1><p>Hi ' + name + ',</p><p>Your host membership period ends on ' + renewsAt + '.</p><p>Renew before it expires to continue publishing paid meetups.</p><p><a href="' + escapeHtml(url) + '">' + escapeHtml(url) + '</a></p></div>',
    }
  }

  return {
    subject: 'A message from Drinking Buddies',
    text: 'You have a new notification from Drinking Buddies.',
    html: '<p>You have a new notification from Drinking Buddies.</p>',
  }
}

async function claimNextJob(): Promise<EmailJob | null> {
  return sql.begin(async (transaction) => {
    const rows = await transaction`
      SELECT id, recipient, template_key, payload, attempts
      FROM email_outbox
      WHERE (status = 'queued' AND next_attempt_at <= now())\n         OR (status = 'processing' AND updated_at < now() - interval '10 minutes')
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `
    const job = rows[0] as EmailJob | undefined
    if (!job) return null

    await transaction`
      UPDATE email_outbox
      SET status = 'processing', attempts = attempts + 1, updated_at = now()
      WHERE id = ${job.id}
    `
    return { ...job, attempts: job.attempts + 1 }
  })
}

async function run() {
  console.info('Drinking Buddies email worker started.')
  while (!stopping) {
    try {
      const job = await claimNextJob()
      if (!job) {
        await new Promise((resolve) => setTimeout(resolve, 2500))
        continue
      }

      try {
        const message = render(job)
        await transport.sendMail({
          from: emailFrom,
          to: job.recipient,
          subject: message.subject,
          text: message.text,
          html: message.html,
        })
        await sql`
          UPDATE email_outbox
          SET status = 'sent', sent_at = now(), last_error = NULL, updated_at = now()
          WHERE id = ${job.id}
        `
        console.info(`Email delivered: ${job.id}`)
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 950) : 'Unknown delivery error'
        const permanentlyFailed = job.attempts >= 5
        const retryAt = new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60_000)
        await sql`
          UPDATE email_outbox
          SET status = ${permanentlyFailed ? 'failed' : 'queued'},
              next_attempt_at = ${retryAt},
              last_error = ${message},
              updated_at = now()
          WHERE id = ${job.id}
        `
        console.error(`Email delivery failed for ${job.id}: ${message}`)
      }
    } catch (error) {
      console.error('Email worker loop failed', error)
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }

  await transport.close()
  await sql.end({ timeout: 5 })
  console.info('Drinking Buddies email worker stopped.')
}

await run()
