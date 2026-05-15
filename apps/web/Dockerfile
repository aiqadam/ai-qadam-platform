# syntax=docker/dockerfile:1.7

# Stage 1 — builder. Install workspace deps + run `astro build` to a
# hybrid dist/ (server + client). With the Node adapter in standalone
# mode (apps/web/astro.config.mjs) the build emits both:
#   dist/server/entry.mjs  — the Node entry that serves SSR pages
#   dist/client/           — the static assets (prerendered HTML, JS, CSS)
FROM node:22.14.0-alpine AS builder
WORKDIR /repo
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Root package.json's `prepare = husky || true` makes the in-container
# install no-op the husky step (it's only available on dev machines).

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/biome-config/package.json packages/biome-config/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
# Full workspace install (no --filter) per apps/api/Dockerfile rationale.
# --prod=false: force devDeps regardless of NODE_ENV Coolify injects as ARG.
RUN pnpm install --frozen-lockfile --prod=false

COPY tsconfig.json ./
COPY packages packages
COPY apps/web apps/web
# globals.css imports design-system tokens + components + portal.css.
COPY design-system design-system

RUN pnpm --filter @aiqadam/web build

# Produce a self-contained prod-only deploy at /out (same pattern as the
# API). With output=static + adapter=node, the runtime needs astro itself
# plus @astrojs/node + react/react-dom as runtime deps.
RUN pnpm --filter @aiqadam/web deploy --prod /out


# Stage 2 — runtime. Tiny Node image running the standalone server.
# Astro's @astrojs/node standalone entry binds HOST=0.0.0.0 PORT=4321 by
# default. Coolify maps its public domain to that port.
FROM node:22.14.0-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

COPY --from=builder /out/package.json ./package.json
COPY --from=builder /out/node_modules ./node_modules
COPY --from=builder /repo/apps/web/dist ./dist

EXPOSE 4321
USER node
CMD ["node", "./dist/server/entry.mjs"]
