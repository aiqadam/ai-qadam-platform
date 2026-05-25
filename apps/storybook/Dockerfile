# syntax=docker/dockerfile:1.7

# apps/storybook/Dockerfile — ADR-0038 §Locks #6 (PR-0e).
#
# Storybook is a static site once built. Two-stage:
#   1) builder — install workspace deps + `storybook build` → static HTML+JS
#      in /repo/apps/storybook/storybook-static/
#   2) runtime — nginx:alpine serving that directory on :80
#
# Same workspace-install shape as apps/web-next/Dockerfile.

FROM node:22.14.0-alpine AS builder
WORKDIR /repo
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/web-next/package.json apps/web-next/package.json
COPY apps/storybook/package.json apps/storybook/package.json
COPY packages/biome-config/package.json packages/biome-config/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
RUN pnpm install --frozen-lockfile --prod=false

COPY tsconfig.json ./
COPY packages packages
COPY design-system design-system
# Storybook stories import atoms from apps/web-next/src/kit/, so the
# whole web-next/src/ tree (kit + lib + styles) must be present at build
# time. We don't run web-next's astro build here, just rely on the
# source for resolve/alias.
COPY apps/web-next apps/web-next
COPY apps/storybook apps/storybook

RUN pnpm --filter @aiqadam/storybook build


# Stage 2 — runtime. nginx:alpine serves the static bundle. Forward-auth
# in front (Authentik via Traefik labels in docker-compose.yml) gates
# every request before it reaches nginx.
FROM nginx:1.27-alpine AS runtime
COPY --from=builder /repo/apps/storybook/storybook-static /usr/share/nginx/html
COPY apps/storybook/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
