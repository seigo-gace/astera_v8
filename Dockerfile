FROM node:22-slim

ENV NODE_ENV=production \
    ASTERA_HOST=127.0.0.1 \
    ASTERA_PORT=7373 \
    ASTERA_DB=/data/astera.db \
    ASTERA_LOG_CACHE_DIR=/cache/outbox \
    LLM_CHAIN=null

WORKDIR /app

COPY package.json start.js ./
COPY STRUCTURE.md README.md ./
COPY src ./src
COPY docs ./docs
COPY scripts ./scripts
COPY config ./config
COPY test ./test
COPY .env.example ./

RUN apt-get update && apt-get install -y --no-install-recommends git python3 python3-pip \
    && pip3 install --no-cache-dir --break-system-packages \
      "mcp>=1.28.1,<2" \
      "pydantic>=2.13.4,<3" \
      "PyYAML>=6.0.3,<7" \
      "regex>=2026.7.19,<2027" \
      "sudachipy==0.6.11" \
      "sudachidict-core==20260428" \
    && rm -rf /var/lib/apt/lists/*

ENV SUDACHI_BIN=sudachipy
ENV SUDACHI_DICT_VERSION=sudachidict-core-20260428

RUN chmod +x scripts/*.sh \
    && mkdir -p /data /data/evidence-jobs /cache/outbox \
    && chown -R node:node /app /data /cache

USER node
EXPOSE 7373

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.ASTERA_PORT||7373)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "start.js"]
