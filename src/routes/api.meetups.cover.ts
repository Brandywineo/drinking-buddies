import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const MAX_BYTES = 5 * 1024 * 1024
const TYPES = {
  'image/jpeg': { extension: 'jpg', signature: [0xff, 0xd8, 0xff] },
  'image/png': { extension: 'png', signature: [0x89, 0x50, 0x4e, 0x47] },
  'image/webp': { extension: 'webp', signature: [0x52, 0x49, 0x46, 0x46] },
} as const

export const Route = createFileRoute('/api/meetups/cover')({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        if (!await getAuthenticatedUserId(request)) return jsonError('Sign in to upload a meetup cover.', 401, 'UNAUTHENTICATED')
        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File)) return jsonError('Choose an image to upload.', 400, 'IMAGE_REQUIRED')
        if (file.size < 1 || file.size > MAX_BYTES) return jsonError('Meetup cover images must be smaller than 5 MB.', 413, 'IMAGE_TOO_LARGE')
        const type = TYPES[file.type as keyof typeof TYPES]
        if (!type) return jsonError('Use a JPG, PNG or WebP image.', 415, 'UNSUPPORTED_IMAGE')
        const bytes = Buffer.from(await file.arrayBuffer())
        if (!type.signature.every((value, index) => bytes[index] === value)
          || (file.type === 'image/webp' && bytes.subarray(8, 12).toString() !== 'WEBP')) {
          return jsonError('The uploaded file is not a valid image of the selected type.', 415, 'INVALID_IMAGE')
        }
        const fileName = randomUUID() + '.' + type.extension
        const directory = process.env.MEETUP_UPLOADS_DIR?.trim() || join(process.cwd(), 'storage', 'meetup-covers')
        await mkdir(directory, { recursive: true, mode: 0o750 })
        await writeFile(join(directory, fileName), bytes, { flag: 'wx', mode: 0o640 })
        return jsonOk({ url: '/api/meetup-covers/' + fileName }, 201)
      } catch (error) {
        console.error('Meetup cover upload failed', error)
        return jsonError('We could not upload this image.', 500, 'COVER_UPLOAD_FAILED')
      }
    },
  } },
})
