# syntax=docker/dockerfile:1.7

# Stage 1 — builder. Install workspace deps + run `astro build` to a fully
# static dist/. Astro static output = HTML files + JS bundles + assets, no
# runtime needed.
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
# Full workspace install (no --filter). The filter form caused binaries
# like astro/nest to be unfindable in BuildKit. See apps/api/Dockerfile.
# --prod=false: force devDeps install regardless of NODE_ENV (Coolify
# injects runtime env as build ARGs; NODE_ENV=production would otherwise
# skip astro/@astrojs/* devDeps).
RUN pnpm install --frozen-lockfile --prod=false

COPY tsconfig.json ./
COPY packages packages
COPY apps/web apps/web
# globals.css imports design-system tokens + components — must be in the
# build context.
COPY design-system design-system

RUN pnpm --filter @aiqadam/web build


# Stage 2 — runtime. Minimal nginx serving the static dist/.
FROM nginx:1.27-alpine AS runtime
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
