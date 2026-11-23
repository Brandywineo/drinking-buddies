import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { memoryAlbums, meetupMembers, meetups, squadMembers, venueStaff, venues } from '../db/schema'

const IMAGE_TYPES: Record<string, { ext: string; signature: number[] }> = {
  'image/jpeg': { ext: 'jpg', signature: [0xff, 0xd8, 0xff] },
  'image/png': { ext: 'png', signature: [0x89, 0x50, 0x4e, 0x47] },
  'image/webp': { ext: 'webp', signature: [0x52, 0x49, 0x46, 0x46] },
}
const VIDEO_TYPES: Record<string, { ext: string }> = { 'video/mp4': { ext: 'mp4' } }

export function mediaDirectory() {
  return process.env.COMMUNITY_MEDIA_DIR?.trim() || join(process.cwd(), 'storage', 'community-media')
}

export async function storeCommunityFile(file: File, allowVideo = true) {
  const image = IMAGE_TYPES[file.type]
  const video = allowVideo ? VIDEO_TYPES[file.type] : undefined
  if (!image && !video) throw new Error('Use JPG, PNG or WebP images' + (allowVideo ? ', or MP4 videos.' : '.'))
  const max = video ? 30 * 1024 * 1024 : 10 * 1024 * 1024
  if (file.size < 1 || file.size > max) throw new Error(video ? 'MP4 videos must be 30 MB or smaller.' : 'Images must be 10 MB or smaller.')
  const bytes = Buffer.from(await file.arrayBuffer())
  if (image) {
    if (!image.signature.every((v, i) => bytes[i] === v)
      || (file.type === 'image/webp' && bytes.subarray(8, 12).toString() !== 'WEBP')) {
      throw new Error('The uploaded file does not match its image type.')
    }
  } else if (bytes.subarray(4, 8).toString() !== 'ftyp') {
    throw new Error('The uploaded file is not a valid MP4 video.')
  }
  const key = randomUUID() + '.' + (image?.ext ?? video!.ext)
  const directory = mediaDirectory()
  await mkdir(directory, { recursive: true, mode: 0o750 })
  await writeFile(join(directory, key), bytes, { flag: 'wx', mode: 0o640 })
  return { key, mimeType: file.type, sizeBytes: bytes.length, mediaKind: video ? 'video' as const : 'image' as const }
}

export async function readCommunityFile(key: string) {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp|mp4)$/.test(key)) throw new Error('Invalid media key.')
  return readFile(join(mediaDirectory(), key))
}

export async function canAccessMemoryAlbum(albumId: string, userId: string) {
  const db = getDb()
  const [album] = await db.select().from(memoryAlbums).where(eq(memoryAlbums.id, albumId)).limit(1)
  if (!album) return null
  if (album.creatorId === userId || album.visibility === 'public') return album
  if (album.meetupId) {
    const [meetup] = await db.select({ hostId: meetups.hostId }).from(meetups).where(eq(meetups.id, album.meetupId)).limit(1)
    if (meetup?.hostId === userId) return album
    const [member] = await db.select({ id: meetupMembers.id }).from(meetupMembers).where(and(
      eq(meetupMembers.meetupId, album.meetupId), eq(meetupMembers.userId, userId), eq(meetupMembers.status, 'approved'),
    )).limit(1)
    return member ? album : null
  }
  if (album.squadId) {
    const [member] = await db.select({ id: squadMembers.id }).from(squadMembers).where(and(
      eq(squadMembers.squadId, album.squadId), eq(squadMembers.userId, userId), eq(squadMembers.status, 'active'),
    )).limit(1)
    return member ? album : null
  }
  return album.visibility === 'members' ? album : null
}

export async function canManageVenue(venueId: string, userId: string) {
  const db = getDb()
  const [venue] = await db.select({ ownerId: venues.ownerId }).from(venues).where(eq(venues.id, venueId)).limit(1)
  if (!venue) return { venue: null, role: null as string | null }
  if (venue.ownerId === userId) return { venue, role: 'owner' }
  const [staff] = await db.select({ role: venueStaff.role }).from(venueStaff).where(and(
    eq(venueStaff.venueId, venueId), eq(venueStaff.userId, userId), eq(venueStaff.status, 'active'),
  )).limit(1)
  return { venue, role: staff?.role ?? null }
}

export function isPlatformAdmin(userId: string) {
  const ids = (process.env.ADMIN_USER_IDS ?? '').split(',').map((value) => value.trim()).filter(Boolean)
  return ids.includes(userId)
}
