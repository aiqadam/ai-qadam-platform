# syntax=docker/dockerfile:1.7

# apps/web-next/Dockerfile — ADR-0038 greenfield web build.
#
# Mirrors apps/web/Dockerfile's two-stage layout. The only difference is
# the workspace filter (@aiqadam/web-next) and the runtime PORT (4322,
# avoiding collision with v1's 4321 during local dev side-by-side runs).
#
# Stage 1 — builder. Install workspace deps + run `astro build` to a
# server bundle (output=server in astro.config.mjs).
FROM node:22.14.0-alpine AS builder
WORKDIR /repo
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/web-next/package.json apps/web-next/package.json
COPY packages/biome-config/package.json packages/biome-config/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
# Full workspace install — see apps/api/Dockerfile + apps/web/Dockerfile
# rationale. --prod=false forces devDeps even when Coolify sets NODE_ENV.
RUN pnpm install --frozen-lockfile --prod=false

COPY tsconfig.json ./
COPY packages packages
COPY apps/web-next apps/web-next
# globals.css imports design-system tokens + components + portal.css.
COPY design-system design-system

RUN pnpm --filter @aiqadam/web-next build

# Produce a self-contained prod-only deploy at /out (same pattern as
# apps/web). Astro's @astrojs/node standalone needs astro itself plus
# @astrojs/node + react/react-dom as runtime deps.
RUN pnpm --filter @aiqadam/web-next deploy --prod /out


# Stage 2 — runtime. Tiny Node image running the standalone server.
# Astro's @astrojs/node standalone entry binds HOST=0.0.0.0 PORT=4322
# by default (we set both explicitly for clarity).
FROM node:22.14.0-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4322

COPY --from=builder /out/package.json ./package.json
COPY --from=builder /out/node_modules ./node_modules
COPY --from=builder /repo/apps/web-next/dist ./dist

EXPOSE 4322
USER node
CMD ["node", "./dist/server/entry.mjs"]
