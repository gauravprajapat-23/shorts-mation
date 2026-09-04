FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates librsvg2-bin && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV PORT=8080 MAX_CONCURRENCY=2 MAX_RETRIES=2 JOB_TTL_SECONDS=21600
EXPOSE 8080
CMD ["node","src/index.mjs"]
