import { existsSync, readFileSync } from 'node:fs'

// Load .env.test, overriding anything inherited, BEFORE any Prisma client is created.
if (existsSync('.env.test')) {
  for (const line of readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
  }
}
if (!/stylegrab_test|localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('Refusing to run tests: DATABASE_URL does not point at a test database (expected a database named stylegrab_test). Create .env.test.')
}
