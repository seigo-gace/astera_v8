FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    ASTERA_BODY_HOST=127.0.0.1 \
    ASTERA_BODY_PORT=7373 \
    ASTERA_RUNTIME_CONFIG_MODULE=/config/runtime-config.mjs \
    ASTERA_BODY_SERVICE_KEY_FILE=/run/secrets/astera_body_service_key \
    ASTERA_LOG_CACHE_DIR=/cache/outbox
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && mkdir -p /cache/outbox /config \
    && chown -R node:node /app /cache /config
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 7373
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.ASTERA_BODY_PORT||7373)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/application-system/server-start.js"]
