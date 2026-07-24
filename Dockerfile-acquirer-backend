# syntax=docker/dockerfile:1.7

FROM node:24.18.0-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared-lib/package.json ./packages/shared-lib/package.json
COPY packages/acquirer-backend/package.json ./packages/acquirer-backend/package.json

RUN --mount=type=cache,target=/root/.npm \
    HUSKY=0 npm ci \
      --workspace shared-lib \
      --workspace @mojaloop/merchant-acquirer-backend

COPY packages/shared-lib/tsconfig.json ./packages/shared-lib/tsconfig.json
COPY packages/shared-lib/src ./packages/shared-lib/src
COPY packages/acquirer-backend/tsconfig.json packages/acquirer-backend/tsconfig.build.json ./packages/acquirer-backend/
COPY packages/acquirer-backend/src ./packages/acquirer-backend/src
COPY packages/acquirer-backend/assets ./packages/acquirer-backend/assets

RUN npm run build --workspace shared-lib \
    && npm run build --workspace @mojaloop/merchant-acquirer-backend

FROM node:24.18.0-alpine AS sharp-dependencies
ARG TARGETARCH
ARG SHARP_VERSION=0.35.3
ARG SHARP_LIBVIPS_VERSION=1.3.2
WORKDIR /sharp

RUN npm init --yes \
    && case "$TARGETARCH" in \
      amd64) sharp_arch=x64 ;; \
      arm64) sharp_arch=arm64 ;; \
      *) echo "Unsupported Sharp architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && npm install --ignore-scripts --no-save \
      "@img/sharp-linuxmusl-${sharp_arch}@${SHARP_VERSION}" \
      "@img/sharp-libvips-linuxmusl-${sharp_arch}@${SHARP_LIBVIPS_VERSION}"

FROM node:24.18.0-alpine AS production-dependencies
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared-lib/package.json ./packages/shared-lib/package.json
COPY packages/acquirer-backend/package.json ./packages/acquirer-backend/package.json

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --omit=optional --ignore-scripts \
      --workspace shared-lib \
      --workspace @mojaloop/merchant-acquirer-backend \
    && npm rebuild bcrypt

COPY --from=sharp-dependencies /sharp/node_modules/@img ./node_modules/@img

RUN node -e "require('sharp')"

FROM node:24.18.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/packages/acquirer-backend/node_modules ./packages/acquirer-backend/node_modules
COPY --from=build --chown=node:node /app/packages/shared-lib/package.json ./packages/shared-lib/package.json
COPY --from=build --chown=node:node /app/packages/shared-lib/dist ./packages/shared-lib/dist
COPY --from=build --chown=node:node /app/packages/acquirer-backend/package.json ./packages/acquirer-backend/package.json
COPY --from=build --chown=node:node /app/packages/acquirer-backend/dist ./packages/acquirer-backend/dist
COPY --from=build --chown=node:node /app/packages/acquirer-backend/src/database/countries.json ./packages/acquirer-backend/dist/src/database/countries.json
COPY --from=build --chown=node:node /app/packages/acquirer-backend/assets ./packages/acquirer-backend/dist/assets

RUN mkdir -p /app/logs && chown node:node /app/logs

USER node
EXPOSE 5555
CMD ["node", "packages/acquirer-backend/dist/src/index.js"]
