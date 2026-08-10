# Multi-stage Dockerfile
# Targets:
#   development — hot reload (source mounted by docker-compose.yml)
#   uat         — production-like standalone build (NEXT_PUBLIC_ENV=uat)
#   production  — optimized standalone build (NEXT_PUBLIC_ENV=production)
#   migrate     — prisma generate + db:push/seed (no Next build)
#
# Shared:
#   base / deps / builder — internal stages (app builds use builder)

# ========================================
# base — Node + pnpm
# ========================================
FROM node:24-alpine AS base

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

# ========================================
# deps — install node_modules (cached layer)
# ========================================
FROM base AS deps

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# ========================================
# builder — prisma generate + next build
# NEXT_PUBLIC_* must be set here (inlined into the client bundle)
# ========================================
FROM base AS builder

WORKDIR /app

ARG NEXT_PUBLIC_ENV=production
ENV NEXT_PUBLIC_ENV=$NEXT_PUBLIC_ENV
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma reads this at generate/build; real URL is set at runtime via entrypoint
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN ./node_modules/.bin/prisma generate

# pnpm nests generated client under .pnpm — stage to stable paths for runtime COPY
RUN PRISMA_CLIENT_DIR="$(find node_modules -type d -path '*/.prisma/client' | head -n 1)" && \
    test -n "$PRISMA_CLIENT_DIR" && \
    mkdir -p /prisma-export/.prisma /prisma-export/@prisma && \
    cp -a "$(dirname "$PRISMA_CLIENT_DIR")" /prisma-export/ && \
    CLIENT_PKG="$(dirname "$(find node_modules -type f -path '*/@prisma/client/package.json' | head -n 1)")" && \
    cp -a "$CLIENT_PKG" /prisma-export/@prisma/client

RUN pnpm build

# ========================================
# migrate — prisma tooling only (no Next build)
# compose migrations service → target: migrate
# ========================================
FROM base AS migrate

WORKDIR /app

ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma
COPY scripts ./scripts

RUN sed -i 's/\r$//' scripts/db-push-safe.sh && chmod +x scripts/db-push-safe.sh

RUN ./node_modules/.bin/prisma generate

# ========================================
# production — standalone Next.js (prod)
# compose: docker-compose.prod.yml → target: production
# ========================================
FROM base AS production

WORKDIR /app

ARG NEXT_PUBLIC_ENV=production
ENV NODE_ENV=production
ENV NEXT_PUBLIC_ENV=$NEXT_PUBLIC_ENV
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

# Standalone may already have @prisma/client as a file/symlink — replace with full export
COPY --from=builder /prisma-export /tmp/prisma-export
RUN rm -rf node_modules/.prisma node_modules/@prisma && \
    mkdir -p node_modules && \
    cp -a /tmp/prisma-export/.prisma node_modules/ && \
    cp -a /tmp/prisma-export/@prisma node_modules/ && \
    rm -rf /tmp/prisma-export

COPY scripts/docker-entrypoint-app.sh /usr/local/bin/docker-entrypoint-app.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint-app.sh && \
    chmod +x /usr/local/bin/docker-entrypoint-app.sh && \
    chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint-app.sh"]
CMD ["node", "server.js"]

# ========================================
# uat — same as production, env label = uat
# compose: docker-compose.uat.yml → target: uat
# Pass build-arg NEXT_PUBLIC_ENV=uat so the client bundle matches
# ========================================
FROM production AS uat

ENV NEXT_PUBLIC_ENV=uat

# ========================================
# development — hot reload (bind-mount source in compose)
# compose: docker-compose.yml → target: development
# ========================================
FROM base AS development

WORKDIR /app

ENV NODE_ENV=development
ENV NEXT_PUBLIC_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV CHOKIDAR_USEPOLLING=true
ENV WATCHPACK_POLLING=true

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --ignore-scripts

COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate

COPY scripts/docker-entrypoint-dev.sh /usr/local/bin/docker-entrypoint-dev.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint-dev.sh && \
    chmod +x /usr/local/bin/docker-entrypoint-dev.sh

EXPOSE 3000

# Source is bind-mounted at runtime; entrypoint syncs DB then runs `pnpm dev`
ENTRYPOINT ["/usr/local/bin/docker-entrypoint-dev.sh"]
