/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Docker support - standalone output for optimal container size (production only)
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  // Ensure Prisma engines are traced into the standalone output (pnpm layout)
  outputFileTracingIncludes: {
    '/**': [
      './node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/**/*',
      './node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/**/*',
    ],
  },
  serverExternalPackages: ['@prisma/client', 'prisma'],

  // Enable webpack polling for Docker on Windows (hot reload fix)
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.watchOptions = {
        poll: 1000, // Check for changes every second
        aggregateTimeout: 300, // Delay before rebuilding
      }
    }
    return config
  },
}

export default nextConfig
