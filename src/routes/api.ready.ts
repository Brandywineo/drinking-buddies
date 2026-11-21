import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'
import { getDb } from '../db'

export const Route = createFileRoute('/api/ready')({
  server: {
    handlers: {
      GET: async () => {
        try {
          await getDb().execute(sql`select 1`)
          return Response.json({ status: 'ready', database: 'connected' })
        } catch (error) {
          console.error('Readiness check failed', error)
          return Response.json({ status: 'not_ready', database: 'unavailable' }, { status: 503 })
        }
      },
    },
  },
})