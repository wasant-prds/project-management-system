# Multi-stage Dockerfile for Next.js Application
# Supports Development, UAT, and Production environments

# ========================================
# Base Stage - Common dependencies
# ========================================
FROM node:20-alpine AS base

# Install dependencies only when needed
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# ========================================
# Dependencies Stage
# ========================================
FROM base AS deps

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# ========================================
# Builder Stage
# ========================================
FROM base AS builder

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY . .

# Generate Prisma Client
RUN ./node_modules/.bin/prisma generate

# Build the application
# Next.js collects telemetry data, disable it
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# ========================================
# Production Stage
# ========================================
FROM base AS production

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Set permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]

# ========================================
# Development Stage
# ========================================
FROM base AS development

WORKDIR /app

ENV NODE_ENV=development

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install all dependencies (including devDependencies)
RUN pnpm install --ignore-scripts

# Copy application code
COPY . .

# Generate Prisma Client
RUN ./node_modules/.bin/prisma generate

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run development server with hot reload
CMD ["pnpm", "dev"]

# ========================================
# UAT Stage
# ========================================
FROM production AS uat

ENV NODE_ENV=production
ENV NEXT_PUBLIC_ENV=uat

# Additional UAT-specific configurations can be added here

