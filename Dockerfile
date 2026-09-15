FROM ubuntu:24.04

ENV NODE_ENV=production \
    ASTERA_HOST=127.0.0.1 \
    ASTERA_PORT=7373 \
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

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg git python3 python3-pip \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && pip3 install --no-cache-dir --break-system-packages sudachipy sudachidict_core \
    && rm -rf /var/lib/apt/lists/*
ENV SUDACHI_BIN=sudachipy
ENV SUDACHI_DICT_VERSION=sudachidict_core-latest

RUN chmod +x scripts/*.sh \
    && mkdir -p /data /data/evidence-jobs /cache/outbox \
    && chown -R ubuntu:ubuntu /app /data /cache

USER ubuntu
EXPOSE 7373

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.ASTERA_PORT||7373)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "start.js"]
