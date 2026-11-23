import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'

const FILE_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp)$/
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export const Route = createFileRoute('/api/meetup-covers/$fileName')({
  server: { handlers: {
    GET: async ({ params }) => {
      const fileName = params.fileName
      if (!FILE_PATTERN.test(fileName)) return new Response('Not found', { status: 404 })
      const extension = fileName.split('.').pop() ?? ''
      const directory = process.env.MEETUP_UPLOADS_DIR?.trim() || join(process.cwd(), 'storage', 'meetup-covers')
      try {
        const bytes = await readFile(join(directory, fileName))
        return new Response(new Uint8Array(bytes), {
          headers: {
            'Content-Type': MIME[extension],
            'Content-Length': String(bytes.byteLength),
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      } catch {
        return new Response('Not found', { status: 404 })
      }
    },
  } },
})
