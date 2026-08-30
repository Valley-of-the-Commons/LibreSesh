# Multi-stage build. Debian base, NOT Alpine: better-sqlite3 ships glibc
# prebuilds, and musl would force a native compile (SPEC §10.4).
FROM node:20-slim AS build

WORKDIR /app

# Build tools, in case a prebuilt better-sqlite3 binary isn't available for
# this platform and npm has to compile it from source.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && apt-get clean \
  && find /var/lib/apt/lists -mindepth 1 -delete

COPY package.json package-lock.json ./
# The repo's .npmrc sets ignore-scripts, which would skip better-sqlite3's
# install step; allow it here so the native addon is actually built.
RUN npm ci --ignore-scripts=false

COPY tsconfig.base.json ./
COPY server ./server
COPY web ./web
COPY scripts ./scripts

# This stage has no .git, so the footer's version stamp has to be passed in.
# Without these it falls back to the package.json version and "unknown".
#   docker build --build-arg BUILD_TAG="$(git describe --tags --abbrev=0)" \
#                --build-arg BUILD_COMMIT="$(git rev-parse --short HEAD)" .
ARG BUILD_TAG
ARG BUILD_COMMIT
ENV BUILD_TAG=$BUILD_TAG
ENV BUILD_COMMIT=$BUILD_COMMIT

RUN npm run build

# Drop dev dependencies from the tree we copy into the runtime image.
RUN npm prune --omit=dev --ignore-scripts=false


FROM node:20-slim AS runtime

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/app.db
ENV PORT=3000
ENV SERVE_STATIC=1

WORKDIR /app

# Runtime needs no compiler; the addon is already built.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/migrations ./server/migrations
COPY --from=build /app/web/dist ./web/dist

# The DB lives on a mounted volume so it survives image rebuilds.
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/events').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
