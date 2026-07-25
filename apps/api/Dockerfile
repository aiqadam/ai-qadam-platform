# syntax=docker/dockerfile:1.7

# Stage 1 — builder. Install all workspace deps, build the NestJS app, then
# use `pnpm deploy --prod` to produce a self-contained directory with only
# the runtime deps wired up. That directory becomes the runtime image's /app.
FROM node:22.14.0-alpine AS builder
WORKDIR /repo
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Root package.json's `prepare` script is `husky || true` — gracefully
# skips when husky isn't in the filtered workspace install (container
# builds use --filter @aiqadam/api... which excludes the root devDeps).
# Husky still installs git hooks normally on dev machines because there
# the full workspace install includes it.

# Install the full workspace, not a filtered subset. The filter
# `--filter @aiqadam/api...` looked correct on paper but in practice
# (verified via Coolify's BuildKit build) it left the nest binary
# unreachable from `pnpm --filter @aiqadam/api build`. The full install
# adds a few seconds + a few MB to the builder stage; the runtime stage
# uses `pnpm deploy --prod` so the final image is unaffected.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/biome-config/package.json packages/biome-config/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
# --prod=false guarantees devDependencies (including @nestjs/cli which
# provides the `nest` binary) are installed, regardless of any NODE_ENV
# the build environment injects. Coolify's BuildKit deploy passes the
# runtime envs as ARGs, including NODE_ENV=production, which would
# otherwise make pnpm skip devDeps and break the nest build below.
#
# ISS-INFRA-001: a `--mount=type=cache` for just the pnpm content-addressable
# store does NOT fix the overlayfs slowness on hosts like pro-data-tech-qa —
# proven by live test. `pnpm install` here writes node_modules straight into
# this layer and is NOT the step that was observed stalling (60-180/810
# packages stuck, 90+ min) — that was specifically `pnpm deploy` below, so
# only that step needs the cache-mount-and-copy treatment; leave install/build
# as plain layer writes (cache-mounting the store still speeds up repeat
# builds by skipping re-download/re-extract of packages).
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod=false

# Now copy the rest of the source the API needs to compile.
COPY tsconfig.json ./
COPY packages packages
COPY apps/api apps/api

# Build NestJS → apps/api/dist
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter @aiqadam/api build

# Produce a self-contained prod-only deploy. `pnpm deploy --prod` writes an
# entirely new hardlinked node_modules tree (810 packages) — this is the step
# that was observed stalling indefinitely on overlayfs. Deploy into a cache
# mount (/out-cache) so the many-small-file linking work happens in cache
# scratch space rather than the overlay diff layer, then `cp -a` the
# finished tree into a plain layer at /out in a single operation (proven
# ~2.8s for the whole repo on the affected host — see ISS-INFRA-001.md).
# The final copy's destination must be named /out (matching what later
# COPY --from=builder references expect) — pnpm's generated
# node_modules/.bin/* shims bake the deploy target's absolute path into
# NODE_PATH, so renaming the destination would leave those shims pointing
# at a path that doesn't exist in the runtime image. This mismatch already
# exists pre-fix too (/out vs. runtime's /app) and is harmless because the
# runtime entrypoint (dist/main.js) never resolves through those shims —
# noted here only so a future path change doesn't assume it's risk-free.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    --mount=type=cache,id=api-deploy-out,target=/out-cache \
    rm -rf /out-cache/out \
    && pnpm --filter @aiqadam/api deploy --prod /out-cache/out \
    && rm -rf /out \
    && cp -a /out-cache/out /out


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
