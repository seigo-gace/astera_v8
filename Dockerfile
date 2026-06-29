FROM node:22-slim

ENV NODE_ENV=production \
    ASTERA_HOST=0.0.0.0 \
    ASTERA_PORT=7373 \
    ASTERA_DB=/data/astera.db \
    ASTERA_LOG_DIR=/logs \
    LLM_CHAIN=null

WORKDIR /app

COPY package.json start.js ./
COPY src ./src
COPY docs ./docs
COPY scripts ./scripts
COPY .env.example ./

RUN chmod +x scripts/*.sh \
    && mkdir -p /data /logs \
    && chown -R node:node /app /data /logs

USER node
EXPOSE 7373

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.ASTERA_PORT||7373)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "start.js"]
