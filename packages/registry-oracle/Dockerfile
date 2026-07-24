# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM node:24.18.0-alpine AS build
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_FETCH_TIMEOUT=300000
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared-lib/package.json ./packages/shared-lib/package.json
COPY packages/registry-oracle/package.json ./packages/registry-oracle/package.json

RUN --mount=type=cache,id=npm-registry-oracle,target=/root/.npm,sharing=locked \
    HUSKY=0 npm ci \
      --workspace shared-lib \
      --workspace @mojaloop/merchant-registry-oracle

COPY packages/shared-lib/tsconfig.json ./packages/shared-lib/tsconfig.json
COPY packages/shared-lib/src ./packages/shared-lib/src
COPY packages/registry-oracle/tsconfig.json packages/registry-oracle/tsconfig.build.json ./packages/registry-oracle/
COPY packages/registry-oracle/src ./packages/registry-oracle/src

RUN npm run build --workspace shared-lib \
    && npm run build --workspace @mojaloop/merchant-registry-oracle

FROM --platform=$BUILDPLATFORM node:24.18.0-alpine AS production-dependencies
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_FETCH_TIMEOUT=300000
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared-lib/package.json ./packages/shared-lib/package.json
COPY packages/registry-oracle/package.json ./packages/registry-oracle/package.json

RUN --mount=type=cache,id=npm-registry-oracle,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --omit=optional --ignore-scripts \
      --workspace shared-lib \
      --workspace @mojaloop/merchant-registry-oracle

FROM node:24.18.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/shared-lib/package.json ./packages/shared-lib/package.json
COPY --from=build --chown=node:node /app/packages/shared-lib/dist ./packages/shared-lib/dist
COPY --from=build --chown=node:node /app/packages/registry-oracle/package.json ./packages/registry-oracle/package.json
COPY --from=build --chown=node:node /app/packages/registry-oracle/dist ./packages/registry-oracle/dist

RUN node -e "require('bcrypt')" \
    && mkdir -p /app/logs \
    && chown node:node /app/logs

USER node
EXPOSE 8888
CMD ["node", "packages/registry-oracle/dist/src/index.js"]
