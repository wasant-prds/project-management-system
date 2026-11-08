# Node/pg runtime; database/schema.sql is the only schema definition.
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV TZ=Asia/Bangkok PGTZ=Asia/Bangkok
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS builder
ARG NEXT_PUBLIC_ENV=production
ENV NEXT_PUBLIC_ENV=$NEXT_PUBLIC_ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Initialization and SQL seed tools; never resets or migrates a used database.
FROM base AS database-tools
RUN apk add --no-cache postgresql-client
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY scripts ./scripts
COPY database/schema.sql ./database/schema.sql
RUN sed -i 's/\r$//' scripts/database/entrypoint.sh
ENTRYPOINT ["sh", "/app/scripts/database/entrypoint.sh"]

FROM base AS production
ARG NEXT_PUBLIC_ENV=production
ENV NODE_ENV=production NEXT_PUBLIC_ENV=$NEXT_PUBLIC_ENV NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME="0.0.0.0"
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY scripts/runtime-*.mjs scripts/owner-gate.mjs scripts/database-url.mjs ./scripts/
COPY scripts/docker-entrypoint-app.sh /usr/local/bin/docker-entrypoint-app.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint-app.sh && \
    chmod +x /usr/local/bin/docker-entrypoint-app.sh && chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
ENTRYPOINT ["/usr/local/bin/docker-entrypoint-app.sh"]
CMD ["node", "server.js"]

FROM production AS uat
ENV NEXT_PUBLIC_ENV=uat

FROM base AS development
ENV NODE_ENV=development NEXT_PUBLIC_ENV=development NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME="0.0.0.0" CHOKIDAR_USEPOLLING=true WATCHPACK_POLLING=true
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./
COPY scripts/docker-entrypoint-dev.sh /usr/local/bin/docker-entrypoint-dev.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint-dev.sh && chmod +x /usr/local/bin/docker-entrypoint-dev.sh
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint-dev.sh"]
