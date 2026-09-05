# ============================================================
# ffmpeg-manager: запись Ivideon/HLS-потоков в .ts.
# ffmpeg берём из apk (в образе node нет бинарника ffmpeg).
# ============================================================

FROM node:22-alpine

# ffmpeg нужен для spawn('ffmpeg') в server.js
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV PORT=9999
ENV RECORD_ROOT=/data/chunks

EXPOSE 9999
CMD ["node", "server.js"]
