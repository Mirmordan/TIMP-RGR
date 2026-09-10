import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,
  appAddress: process.env.APP_ADDRESS || 'localhost',
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  docs: {
    enabled: process.env.NODE_ENV === 'production' ? process.env.SWAGGER_ENABLED === '1' : true,
  },
  security: {
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
    accessTokenTtl: process.env.JWT_ACCESS_TTL || '30m',
    refreshTokenTtl: process.env.JWT_REFRESH_TTL || '30d',
    /**
     * Secure-флаг у сессионных cookie. По умолчанию как в прод (NODE_ENV=production),
     * но управляется явно: COOKIE_SECURE=0/false — для деплоя по HTTP без TLS
     * (иначе браузер выбрасывает cookie и сессия мгновенно падает на 401).
     */
    cookieSecure: process.env.COOKIE_SECURE
      ? !['0', 'false'].includes(process.env.COOKIE_SECURE.trim().toLowerCase())
      : process.env.NODE_ENV === 'production',
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
  watchdog: {
    /** Grace-период «тишины» .ts (сек): после него running-запись с открытым сегментом помечается failed. */
    stallGraceS: Number(process.env.WATCHDOG_STALL_GRACE_S) || 180,
    /** Период тика watchdog (сек). */
    tickS: Number(process.env.WATCHDOG_TICK_S) || 60,
  },
  owner: {
    /** Логин защищённого owner-аккаунта; пусто — owner не инициализируется. */
    username: (process.env.OWNER_USERNAME || '').trim(),
    /** Пароль owner (bcrypt-хэшируется при создании/сбросе). */
    password: process.env.OWNER_PASSWORD || '',
    /** Email owner (если пусто — синтетический <username>@owner.local). */
    email: (process.env.OWNER_EMAIL || '').trim(),
    /** При truthy (1/true) пересоздать пароль существующего owner из OWNER_PASSWORD. */
    passwordForce: ['1', 'true'].includes((process.env.OWNER_PASSWORD_FORCE || '').trim().toLowerCase()),
  },
};
