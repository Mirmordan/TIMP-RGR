# ============================================================
# All-in-one образ приложения (frontend + backend).
# Многоступенчатая сборка: web-build собирает Vite dist, backend-deps
# ставит зависимости бэкенда, финальный слой склеивает всё вместе.
#
# НЕ оптимизируем на runtime-only: продакшен-запуск идёт через tsx
# (src/*.ts выполняется "на лету"), а tsx объявлен в devDependencies —
# поэтому ставим полный npm ci. Осознанный учебный выбор.
# ============================================================

# --- Сборка фронтенда (Vite) ---
FROM node:22-alpine AS web-build
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Зависимости бэкенда (полный набор, нужен tsx из devDeps) ---
FROM node:22-alpine AS backend-deps
WORKDIR /be
COPY backend/package*.json ./
RUN npm ci

# --- Финальный слой: бэкенд + собранный фронтенд ---
FROM node:22-alpine
ENV NODE_ENV=production
ENV PORT=5000
WORKDIR /app/backend

# ffmpeg: бэкенд сам спавнит его для экспорта фрагментов (/processes/:id/export)
# и отдачи сегментов (/segments/:id/video).
RUN apk add --no-cache ffmpeg

COPY --from=backend-deps /be/node_modules ./node_modules
COPY backend/ ./
# Статика фронтенда, раздаётся express'ом (см. backend/src/app.ts: SPA-fallback)
COPY --from=web-build /fe/dist ./public

EXPOSE 5000
CMD ["npx", "tsx", "src/server.ts"]
