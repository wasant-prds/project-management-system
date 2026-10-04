import { loadEnvFile } from 'node:process'
import { defineConfig } from 'prisma/config'

// Prisma config files disable implicit .env loading. Keep the root .env workflow;
// Node preserves values already supplied by the shell or container.
try {
  loadEnvFile()
} catch (error) {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'ENOENT') {
    throw error
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { seed: 'tsx prisma/seed.ts' },
})
