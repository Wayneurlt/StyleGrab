import { execSync } from 'node:child_process'

export default function setup() {
  // Reuse the same guard + env loading as the workers, then apply migrations to the test database.
  return import('./setup-env').then(() => {
    execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env })
  })
}
