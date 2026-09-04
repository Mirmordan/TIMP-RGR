import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,
  appAddress: process.env.APP_ADDRESS || 'localhost',
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  security: {
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
    accessTokenTtl: process.env.JWT_ACCESS_TTL || '30m',
    refreshTokenTtl: process.env.JWT_REFRESH_TTL || '30d',
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_DATABASE || 'rgrdb',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  mediaMTX: {
    apiUrl: process.env.MEDIA_MTX_API || 'http://localhost:9997',
    /** Путь записи внутри Docker-контейнера (mediaMTX видит /data). */
    recordRoot: process.env.MEDIA_MTX_RECORD_ROOT || '/data/chunks',
    /** Путь записи на хосте (бэкенд сканирует файлы). */
    recordRootHost: process.env.MEDIA_RECORD_ROOT_HOST || '/home/mirmordan/Projects/TIMP-RGR/data/chunks',
  },
  ffmpegManager: {
    apiUrl: process.env.FFMPEG_MANAGER_API || 'http://localhost:9999',
    recordRoot: process.env.FFMPEG_MANAGER_RECORD_ROOT || '/home/mirmordan/Projects/TIMP-RGR/ffmpeg-manager/recordings',
  },
};
