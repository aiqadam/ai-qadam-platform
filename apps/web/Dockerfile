# syntax=docker/dockerfile:1.7

# Stage 1 — builder. Install workspace deps + run `astro build` to a fully
# static dist/. Astro static output = HTML files + JS bundles + assets, no
# runtime needed.
FROM node:22.14.0-alpine AS builder
WORKDIR /repo
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/biome-config/package.json packages/biome-config/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @aiqadam/web...

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
