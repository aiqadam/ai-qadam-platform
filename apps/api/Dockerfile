# syntax=docker/dockerfile:1.7

# Stage 1 — builder. Install all workspace deps, build the NestJS app, then
# use `pnpm deploy --prod` to produce a self-contained directory with only
# the runtime deps wired up. That directory becomes the runtime image's /app.
FROM node:22.14.0-alpine AS builder
WORKDIR /repo
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Disable husky during the in-container install. Husky is the root
# package.json's `prepare` script for git hooks on dev machines — irrelevant
# (and not installed) inside a builder image, where it would fail with
# "sh: husky: not found".
ENV HUSKY=0

# Cache pnpm store to speed rebuilds. Copying lock + manifests first lets
# Docker layer-cache the install when only source changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/biome-config/package.json packages/biome-config/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @aiqadam/api...

# Now copy the rest of the source the API needs to compile.
COPY tsconfig.json ./
COPY packages packages
COPY apps/api apps/api

# Build NestJS → apps/api/dist
RUN pnpm --filter @aiqadam/api build

# Produce a self-contained prod-only deploy at /out.
RUN pnpm --filter @aiqadam/api deploy --prod /out


# Stage 2 — runtime. Tiny image: Node + the deployed app.
FROM node:22.14.0-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /out/package.json ./package.json
COPY --from=builder /out/node_modules ./node_modules
COPY --from=builder /out/dist ./dist
# Migrations travel with the image so `drizzle-kit migrate` (or the equivalent
# manual `node --eval` for `migrate(...)` if we add one) can run from the
# container at boot via a one-shot deploy command.
COPY --from=builder /repo/apps/api/src/db/migrations ./src/db/migrations
COPY --from=builder /repo/apps/api/drizzle.config.ts ./drizzle.config.ts

EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]
