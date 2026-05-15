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
RUN pnpm install --frozen-lockfile

# Now copy the rest of the source the API needs to compile.
COPY tsconfig.json ./
COPY packages packages
COPY apps/api apps/api

# DEBUG: see what's actually in apps/api before the build runs.
RUN echo "=== ls apps/api ===" && ls -la apps/api && \
    echo "=== ls apps/api/node_modules ===" && (ls apps/api/node_modules | head -20 2>&1 || echo "NO node_modules") && \
    echo "=== ls apps/api/node_modules/.bin ===" && (ls apps/api/node_modules/.bin 2>&1 | head -20 || echo "NO .bin") && \
    echo "=== which nest ===" && (which nest || echo "no nest in PATH") && \
    echo "=== root node_modules/.bin ===" && (ls node_modules/.bin 2>&1 | head -20)

# Build NestJS → apps/api/dist
RUN cd apps/api && pnpm exec nest build

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
