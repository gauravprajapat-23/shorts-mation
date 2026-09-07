FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg chromium tar ca-certificates fonts-dejavu-core fonts-liberation fonts-noto-core fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY scripts ./scripts
COPY goldens ./goldens
ENV PORT=8080 MAX_CONCURRENCY=2 MAX_RETRIES=2 CHROMIUM_PATH=/usr/bin/chromium CHROMIUM_ASSET_TIMEOUT_MS=15000 ASSET_PREFETCH_CONCURRENCY=6 GOLDEN_MIN_SSIM=0.995 RENDER_WORK_ROOT=/tmp/shorts-mation-render RENDER_LEASE_SECONDS=45 RENDER_HEARTBEAT_MS=10000 RENDER_RECONCILE_MS=15000 RENDER_DRAIN_TIMEOUT_MS=30000
EXPOSE 8080
CMD ["node","src/index.mjs"]
