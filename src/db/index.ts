import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

let sqlClient: ReturnType<typeof postgres> | undefined

export function getDb() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured')
  }

  sqlClient ??= postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  })

  return drizzle(sqlClient, { schema })
}

export async function closeDb() {
  if (sqlClient) {
    await sqlClient.end({ timeout: 5 })
    sqlClient = undefined
  }
}