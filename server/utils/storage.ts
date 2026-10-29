import { randomBytes } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { DomainError } from '../lib/errors'

/**
 * Object storage for uploads. This release ships a local-disk driver (UPLOAD_DIR); keys are random and
 * contain no user input, so they cannot traverse paths. Swap `putObject/getObject/deleteObject` for an
 * S3-compatible implementation when deploying to ephemeral/multi-instance hosting.
 */

const SIGNATURES: { mime: string, ext: string, test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', ext: 'jpg', test: b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { mime: 'image/png', ext: 'png', test: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) },
  { mime: 'image/webp', ext: 'webp', test: b => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
]

const KEY_RE = /^[a-f0-9]{32}\.(jpg|png|webp)$/

function dir() {
  return resolve(useRuntimeConfig().uploadDir)
}

/** Validates by magic bytes (not the client-supplied type or extension) and size. */
export function sniffImage(data: Buffer, maxBytes: number) {
  if (data.length === 0) throw new DomainError('empty_file', 'The file is empty', 422)
  if (data.length > maxBytes) throw new DomainError('file_too_large', `Images must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller`, 413)
  const sig = SIGNATURES.find(s => s.test(data))
  if (!sig) throw new DomainError('unsupported_type', 'Only JPEG, PNG and WebP images are allowed', 415)
  return sig
}

export async function putImage(data: Buffer, maxBytes: number) {
  const sig = sniffImage(data, maxBytes)
  const key = `${randomBytes(16).toString('hex')}.${sig.ext}`
  await mkdir(dir(), { recursive: true })
  await writeFile(join(dir(), key), data, { flag: 'wx' })
  return { key, mimeType: sig.mime, sizeBytes: data.length }
}

export async function getObject(key: string) {
  if (!KEY_RE.test(key)) return null
  try {
    const data = await readFile(join(dir(), key))
    const ext = key.split('.').pop()!
    return { data, mimeType: SIGNATURES.find(s => s.ext === ext)!.mime }
  }
  catch {
    return null
  }
}

export async function deleteObject(key: string) {
  if (!KEY_RE.test(key)) return
  await unlink(join(dir(), key)).catch(() => undefined)
}
