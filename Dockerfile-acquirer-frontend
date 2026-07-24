# syntax=docker/dockerfile:1.7

FROM node:24.18.0-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared-lib/package.json ./packages/shared-lib/package.json
COPY packages/acquirer-frontend/package.json ./packages/acquirer-frontend/package.json

RUN --mount=type=cache,target=/root/.npm \
    HUSKY=0 npm ci \
      --workspace shared-lib \
      --workspace @mojaloop/merchant-acquirer-frontend

COPY packages/shared-lib/tsconfig.json ./packages/shared-lib/tsconfig.json
COPY packages/shared-lib/src ./packages/shared-lib/src
COPY packages/acquirer-frontend/index.html packages/acquirer-frontend/tsconfig.json packages/acquirer-frontend/tsconfig.node.json packages/acquirer-frontend/vite.config.ts ./packages/acquirer-frontend/
COPY packages/acquirer-frontend/public ./packages/acquirer-frontend/public
COPY packages/acquirer-frontend/src ./packages/acquirer-frontend/src

RUN npm run build --workspace shared-lib \
    && npm run build --workspace @mojaloop/merchant-acquirer-frontend

FROM nginx:alpine AS runtime
ENV NGINX_ENVSUBST_OUTPUT_DIR=/usr/share/nginx/html

COPY docker/acquirer-frontend.nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/frontend-config.js.template /etc/nginx/templates/config.js.template
COPY --from=build /app/packages/acquirer-frontend/dist /usr/share/nginx/html

EXPOSE 5173
