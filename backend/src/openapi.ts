import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './config';

/**
 * Центральная OpenAPI 3.0.3-спека API. Пути эндпоинтов (см. JSDoc-аннотации
 * в роутах) указываются БЕЗ префикса — он подставляется через servers[].url.
 */
const definition = {
  openapi: '3.0.3',
  info: {
    title: 'ТИМП-РГР Recording API',
    version: '1.0.0',
    description:
      'Backend системы управления записью видеонаблюдения: устройства, потоки, ' +
      'процессы записи, сегменты/чанки, инциденты, RBAC и статистика. ' +
      'Аутентификация — сессия в httpOnly cookies access_token/refresh_token, ' +
      'fallback — заголовок Authorization: Bearer <JWT>.',
  },
  servers: [{ url: config.apiPrefix }],
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  tags: [
    { name: 'Health', description: 'Проверка доступности API' },
    { name: 'Auth', description: 'Аутентификация и сессии' },
    { name: 'Users', description: 'Управление пользователями' },
    { name: 'Devices', description: 'Устройства видеонаблюдения' },
    { name: 'Streams', description: 'Потоки-источники записи' },
    { name: 'Processes', description: 'Процессы записи' },
    { name: 'Chunks', description: 'Чанки записей (файлы на диске)' },
    { name: 'Segments', description: 'Сегменты записей (временные отрезки)' },
    { name: 'Recordings', description: 'Сводные операции над записями' },
    { name: 'Incidents', description: 'Инциденты на записях' },
    { name: 'Admin', description: 'Администрирование (роли, права, аудит)' },
    { name: 'Stats', description: 'Статистика по объектам' },
  ],
  components: {
    securitySchemes: {
      accessTokenCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'access_token',
        description: 'httpOnly cookie, выдаётся при login/refresh.',
      },
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'string',
            description: 'Текст ошибки (на русском).',
          },
        },
      },
      User: {
        type: 'object',
        required: ['id', 'username', 'email', 'createdAt'],
        properties: {
          id: { type: 'string', description: 'UUID пользователя.' },
          username: { type: 'string', description: 'Уникальный логин.' },
          email: { type: 'string', format: 'email' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AuthUser: {
        description: 'Пользователь + его роль (ответ /auth/*).',
        allOf: [
          { $ref: '#/components/schemas/User' },
          {
            type: 'object',
            required: ['role'],
            properties: {
              role: {
                type: 'string',
                enum: ['admin', 'operator', 'viewer'],
              },
            },
          },
        ],
      },
      AuthPayload: {
        type: 'object',
        required: ['user', 'capabilities'],
        properties: {
          user: { $ref: '#/components/schemas/AuthUser' },
          capabilities: {
            type: 'array',
            items: { type: 'string' },
            description: 'Системные capabilities по роли.',
          },
        },
      },
      Device: {
        type: 'object',
        required: ['id', 'name', 'type', 'createdAt'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string', description: 'Эффективное название (общее поле objects).' },
          type: { type: 'string', description: 'Тип устройства (например, camera).' },
          description: { type: 'string', nullable: true, description: 'Описание (общее поле objects).' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Stream: {
        type: 'object',
        required: ['id', 'url', 'createdAt'],
        properties: {
          id: { type: 'string' },
          url: { type: 'string', description: 'URL источника (ivideon://, HLS...).' },
          deviceId: { type: 'string', description: 'ID связанного устройства.' },
          sourceFingerprint: { type: 'string' },
          name: {
            type: 'string',
            nullable: true,
            description: 'Эффективное название: собственное (objects.name) или унаследованное от устройства.',
          },
          description: { type: 'string', nullable: true, description: 'Описание (общее поле objects).' },
          parentObjectId: {
            type: 'string',
            nullable: true,
            description: 'ID родительского объекта (устройства) в иерархии objects.',
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      StreamView: {
        type: 'object',
        description:
          'Результат открытия view-сессии: HLS-URL для просмотра «что сейчас на камере» без записи.',
        required: ['hlsUrl', 'source', 'ttlS'],
        properties: {
          hlsUrl: {
            type: 'string',
            description:
              'URL HLS-плейлиста: /hls/process_<id>/index.m3u8 или /live/process_<id>/index.m3u8 ' +
              'когда запись идёт (source=process), иначе /hls/view_<streamId>/index.m3u8 или ' +
              '/live/view_<streamId>/index.m3u8 выделенного view-пути (source=view).',
          },
          source: {
            type: 'string',
            enum: ['process', 'view'],
            description: 'process — смотрим живой process-путь записи; view — поднят view-путь без записи.',
          },
          ttlS: {
            type: 'integer',
            description: 'Время жизни view-сессии, сек; продлевается каждым POST /streams/:id/view.',
          },
        },
      },
      Process: {
        type: 'object',
        required: ['id', 'streamId', 'startedAt', 'status', 'createdAt'],
        properties: {
          id: { type: 'string' },
          streamId: { type: 'string' },
          startedAt: { type: 'string', format: 'date-time' },
          endedAt: { type: 'string', format: 'date-time', nullable: true },
          status: { type: 'string', enum: ['running', 'stopped', 'failed'] },
          name: {
            type: 'string',
            nullable: true,
            description: 'Эффективное название записи (собственное или унаследованное от потока/устройства).',
          },
          description: { type: 'string', nullable: true, description: 'Описание (общее поле objects).' },
          parentObjectId: {
            type: 'string',
            nullable: true,
            description: 'ID родительского объекта (потока) в иерархии objects.',
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Chunk: {
        type: 'object',
        required: ['id', 'processId', 'startedAt', 'endedAt', 'url', 'createdAt'],
        properties: {
          id: { type: 'string' },
          processId: { type: 'string' },
          startedAt: { type: 'string', format: 'date-time' },
          endedAt: { type: 'string', format: 'date-time' },
          url: { type: 'string' },
          name: { type: 'string', nullable: true, description: 'Эффективное название (унаследованное).' },
          description: { type: 'string', nullable: true },
          parentObjectId: { type: 'string', nullable: true, description: 'ID родительского объекта (процесса).' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Segment: {
        type: 'object',
        required: [
          'id',
          'processId',
          'streamId',
          'path',
          'startedAt',
          'fileCount',
          'durationS',
          'sizeBytes',
          'createdAt',
        ],
        properties: {
          id: { type: 'string' },
          processId: { type: 'string' },
          streamId: { type: 'string' },
          path: { type: 'string', description: 'Относительный путь сегмента.' },
          startedAt: { type: 'string', format: 'date-time' },
          endedAt: { type: 'string', format: 'date-time', nullable: true },
          fileCount: { type: 'integer' },
          durationS: { type: 'number', description: 'Длительность, секунды.' },
          sizeBytes: { type: 'integer' },
          name: { type: 'string', nullable: true, description: 'Эффективное название (унаследованное).' },
          description: { type: 'string', nullable: true },
          parentObjectId: { type: 'string', nullable: true, description: 'ID родительского объекта (процесса).' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Incident: {
        type: 'object',
        required: ['id', 'processId', 'title', 'timeOffsetS', 'severity', 'createdAt'],
        properties: {
          id: { type: 'string' },
          processId: { type: 'string' },
          segmentId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          timeOffsetS: { type: 'number' },
          severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
          createdAt: { type: 'string', format: 'date-time' },
          createdBy: { type: 'string', description: 'Имя пользователя-автора.' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
        },
      },
      ChangePasswordRequest: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', description: 'Текущий пароль.' },
          newPassword: { type: 'string', minLength: 12 },
        },
      },
      UserCreate: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 32,
            pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$',
          },
          email: { type: 'string', format: 'email' },
          password: {
            type: 'string',
            minLength: 12,
            description: 'Пароль в открытом виде (хранится только хэш).',
          },
        },
      },
      UserPatch: {
        type: 'object',
        description: 'Частичное обновление пользователя; хотя бы одно поле обязательно.',
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 32,
            pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$',
          },
          email: { type: 'string', format: 'email' },
          password: {
            type: 'string',
            minLength: 12,
            description: 'Пароль в открытом виде (хранится только хэш).',
          },
        },
      },
      DeviceCreate: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Название устройства.' },
          type: { type: 'string', description: 'Тип устройства (необязателен).' },
        },
      },
      DevicePatch: {
        type: 'object',
        description: 'Частичное обновление устройства; хотя бы одно поле обязательно.',
        properties: {
          name: { type: 'string', description: 'Название устройства.' },
          type: { type: 'string', description: 'Тип устройства.' },
        },
      },
      StreamCreate: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'URL источника (ivideon://, HLS...).' },
          deviceId: {
            type: 'string',
            format: 'uuid',
            description: 'ID устройства, к которому привязан поток.',
          },
          sourceFingerprint: { type: 'string' },
        },
      },
      StreamPatch: {
        type: 'object',
        description: 'Частичное обновление потока; хотя бы одно поле обязательно.',
        properties: {
          url: { type: 'string', description: 'URL источника (ivideon://, HLS...).' },
          deviceId: {
            type: 'string',
            format: 'uuid',
            description: 'ID устройства, к которому привязан поток.',
          },
          sourceFingerprint: { type: 'string' },
        },
      },
      ProcessCreate: {
        type: 'object',
        required: ['streamId'],
        properties: {
          streamId: {
            type: 'string',
            format: 'uuid',
            description: 'ID потока-источника записи.',
          },
          startedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Момент старта записи; по умолчанию текущее время.',
          },
          status: {
            type: 'string',
            enum: ['running', 'stopped', 'failed'],
            description: 'Статус процесса; по умолчанию running (запись стартует сразу).',
          },
        },
      },
      ProcessPut: {
        type: 'object',
        required: ['streamId', 'startedAt', 'endedAt', 'status'],
        properties: {
          streamId: { type: 'string', format: 'uuid', description: 'ID потока-источника записи.' },
          startedAt: { type: 'string', format: 'date-time', description: 'Момент старта записи.' },
          endedAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Момент остановки записи; null — запись ещё идёт.',
          },
          status: {
            type: 'string',
            enum: ['running', 'stopped', 'failed'],
            description: 'Статус процесса записи.',
          },
        },
      },
      ProcessPatch: {
        type: 'object',
        description: 'Частичное обновление процесса; хотя бы одно поле обязательно. Смена status запускает/останавливает поток mediaMTX.',
        properties: {
          streamId: { type: 'string', format: 'uuid', description: 'ID потока-источника записи.' },
          startedAt: { type: 'string', format: 'date-time', description: 'Момент старта записи.' },
          endedAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Момент остановки записи; обычно проставляется автоматически при смене status.',
          },
          status: {
            type: 'string',
            enum: ['running', 'stopped', 'failed'],
            description: 'Статус процесса записи.',
          },
        },
      },
      ChunkCreate: {
        type: 'object',
        required: ['processId', 'url'],
        properties: {
          processId: {
            type: 'string',
            format: 'uuid',
            description: 'ID процесса записи, к которому относится чанк.',
          },
          startedAt: { type: 'string', format: 'date-time', description: 'Начало чанка.' },
          endedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Конец чанка; не может быть раньше startedAt.',
          },
          url: { type: 'string', description: 'URL/путь файла записи на диске.' },
        },
      },
      ChunkPut: {
        type: 'object',
        required: ['processId', 'startedAt', 'endedAt', 'url'],
        properties: {
          processId: {
            type: 'string',
            format: 'uuid',
            description: 'ID процесса записи, к которому относится чанк.',
          },
          startedAt: { type: 'string', format: 'date-time', description: 'Начало чанка.' },
          endedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Конец чанка; не может быть раньше startedAt.',
          },
          url: { type: 'string', description: 'URL/путь файла записи на диске.' },
        },
      },
      ChunkPatch: {
        type: 'object',
        description: 'Частичное обновление чанка; хотя бы одно поле обязательно.',
        properties: {
          processId: {
            type: 'string',
            format: 'uuid',
            description: 'ID процесса записи, к которому относится чанк.',
          },
          startedAt: { type: 'string', format: 'date-time', description: 'Начало чанка.' },
          endedAt: { type: 'string', format: 'date-time', description: 'Конец чанка.' },
          url: { type: 'string', description: 'URL/путь файла записи на диске; не может быть пустым.' },
        },
      },
      IncidentCreate: {
        type: 'object',
        required: ['processId', 'title', 'timeOffsetS'],
        properties: {
          processId: {
            type: 'string',
            format: 'uuid',
            description: 'ID процесса записи, к которому относится инцидент.',
          },
          segmentId: {
            type: 'string',
            format: 'uuid',
            description: 'ID сегмента (необязателен).',
          },
          title: { type: 'string', description: 'Краткое название инцидента.' },
          description: { type: 'string', description: 'Подробное описание (необязательно).' },
          timeOffsetS: {
            type: 'number',
            description: 'Смещение от начала записи в секундах.',
          },
          severity: {
            type: 'string',
            enum: ['info', 'warning', 'critical'],
            description: 'Важность; по умолчанию info.',
          },
        },
      },
      IncidentPatch: {
        type: 'object',
        description:
          'Частичное обновление инцидента; хотя бы одно поле обязательно. ' +
          'Допустимые значения severity проверяются на уровне БД, невалидное значение не перехватывается валидатором API (приведёт к 5xx).',
        properties: {
          title: { type: 'string', description: 'Краткое название инцидента.' },
          description: { type: 'string', description: 'Подробное описание.' },
          severity: {
            type: 'string',
            enum: ['info', 'warning', 'critical'],
            description: 'Важность инцидента.',
          },
          timeOffsetS: {
            type: 'number',
            description: 'Смещение от начала записи в секундах.',
          },
        },
      },
      SegmentTimeline: {
        type: 'object',
        description: 'Таймлайн записей процесса для фронтенда.',
        required: ['segments', 'totalDurationS', 'start', 'end', 'live'],
        properties: {
          segments: {
            type: 'array',
            description: 'Сегменты процесса с раскладкой на общем таймлайне.',
            items: {
              type: 'object',
              required: ['id', 'startOffsetS', 'durationS', 'fileCount', 'sizeBytes', 'startedAt', 'endedAt', 'live'],
              properties: {
                id: { type: 'string', description: 'UUID сегмента.' },
                startOffsetS: {
                  type: 'number',
                  description: 'Смещение начала сегмента от начала таймлайна, секунды.',
                },
                durationS: { type: 'number', description: 'Длительность сегмента, секунды.' },
                fileCount: { type: 'integer', description: 'Количество .ts файлов сегмента.' },
                sizeBytes: { type: 'integer', description: 'Суммарный размер файлов, байты.' },
                startedAt: { type: 'string', format: 'date-time' },
                endedAt: {
                  type: 'string',
                  format: 'date-time',
                  nullable: true,
                  description: 'null — сегмент ещё открыт.',
                },
                live: { type: 'boolean', description: 'true — открытый (незавершённый) сегмент.' },
              },
            },
          },
          totalDurationS: { type: 'number', description: 'Общая длительность таймлайна, секунды.' },
          start: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Начало таймлайна.',
          },
          end: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Конец таймлайна (текущее время, если процесс жив).',
          },
          live: { type: 'boolean', description: 'true — процесс сейчас в статусе running.' },
        },
      },
      OverviewStats: {
        type: 'object',
        required: ['processes', 'segments', 'incidents', 'devices', 'topDevices', 'recordingTodayS'],
        properties: {
          processes: {
            type: 'object',
            required: ['total', 'running'],
            properties: {
              total: { type: 'integer', description: 'Всего процессов записи.' },
              running: { type: 'integer', description: 'Процессов в статусе running.' },
            },
          },
          segments: {
            type: 'object',
            required: ['count', 'durationS', 'sizeBytes'],
            properties: {
              count: { type: 'integer', description: 'Количество сегментов.' },
              durationS: { type: 'number', description: 'Суммарная длительность, секунды.' },
              sizeBytes: { type: 'number', description: 'Суммарный размер, байты.' },
            },
          },
          incidents: {
            type: 'object',
            required: ['total', 'bySeverity', 'last24h'],
            properties: {
              total: { type: 'integer', description: 'Всего инцидентов.' },
              bySeverity: {
                type: 'object',
                required: ['info', 'warning', 'critical'],
                properties: {
                  info: { type: 'integer' },
                  warning: { type: 'integer' },
                  critical: { type: 'integer' },
                },
              },
              last24h: { type: 'integer', description: 'Инцидентов за последние 24 часа.' },
            },
          },
          devices: {
            type: 'object',
            required: ['visible'],
            properties: {
              visible: { type: 'integer', description: 'Видимых пользователю устройств.' },
            },
          },
          topDevices: {
            type: 'array',
            description: 'Топ-5 устройств по длительности записи.',
            items: {
              type: 'object',
              required: ['id', 'name', 'durationS'],
              properties: {
                id: { type: 'string', description: 'UUID устройства.' },
                name: { type: 'string', description: 'Название устройства.' },
                durationS: { type: 'number', description: 'Суммарная длительность записей, секунды.' },
              },
            },
          },
          recordingTodayS: {
            type: 'number',
            description: 'Записей за сегодня (учитывая идущие сегменты), секунды.',
          },
        },
      },
      TimelineRow: {
        type: 'object',
        description: 'Бакет «день × устройство» для графика длительности записей.',
        required: ['day', 'device', 'seconds'],
        properties: {
          day: { type: 'string', description: 'Дата в формате YYYY-MM-DD.' },
          device: { type: 'string', description: 'Название устройства.' },
          seconds: { type: 'number', description: 'Длительность записей за этот день, секунды.' },
        },
      },
      IncidentTimelineRow: {
        type: 'object',
        description: 'Бакет «день × severity» для графика инцидентов.',
        required: ['day', 'severity', 'count'],
        properties: {
          day: { type: 'string', description: 'Дата в формате YYYY-MM-DD.' },
          severity: {
            type: 'string',
            enum: ['info', 'warning', 'critical'],
            description: 'Важность инцидента.',
          },
          count: { type: 'integer', description: 'Количество инцидентов.' },
        },
      },
      DiskStats: {
        type: 'object',
        required: ['chunksBytes', 'freeBytes', 'totalBytes'],
        properties: {
          chunksBytes: {
            type: 'number',
            format: 'int64',
            nullable: true,
            description: 'Суммарный размер чанков записей на диске, байты.',
          },
          freeBytes: {
            type: 'number',
            format: 'int64',
            nullable: true,
            description: 'Свободное место на разделе, байты (null, если недоступно).',
          },
          totalBytes: {
            type: 'number',
            format: 'int64',
            nullable: true,
            description: 'Общий объём раздела, байты (null, если недоступно).',
          },
        },
      },
      RbacRole: {
        type: 'object',
        required: ['id', 'name', 'createdAt'],
        properties: {
          id: { type: 'string', description: 'UUID роли.' },
          name: { type: 'string', description: 'Имя роли.' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      RbacUserWithRoles: {
        type: 'object',
        required: ['id', 'username', 'email', 'createdAt', 'passwordSet', 'roles'],
        properties: {
          id: { type: 'string', description: 'UUID пользователя.' },
          username: { type: 'string', description: 'Уникальный логин.' },
          email: { type: 'string', format: 'email' },
          createdAt: { type: 'string', format: 'date-time' },
          passwordSet: { type: 'boolean', description: 'Задан ли пароль пользователю.' },
          roles: {
            type: 'array',
            description: 'Роли пользователя.',
            items: {
              type: 'object',
              required: ['id', 'name'],
              properties: {
                id: { type: 'string', description: 'UUID роли.' },
                name: { type: 'string', description: 'Имя роли.' },
              },
            },
          },
        },
      },
      RbacGroup: {
        type: 'object',
        required: ['id', 'name', 'objectCount'],
        properties: {
          id: { type: 'string', description: 'UUID группы объектов.' },
          name: { type: 'string', description: 'Имя группы.' },
          objectCount: { type: 'integer', description: 'Количество объектов в группе.' },
        },
      },
      RbacGroupObject: {
        type: 'object',
        required: ['objectId', 'name', 'type'],
        properties: {
          objectId: { type: 'string', description: 'UUID объекта (камеры).' },
          name: {
            type: 'string',
            nullable: true,
            description: 'Название устройства (null, если объект не устройство).',
          },
          type: {
            type: 'string',
            nullable: true,
            description: 'Тип объекта (null, если неизвестен).',
          },
        },
      },
      RbacPermission: {
        type: 'object',
        required: ['id', 'roleId', 'roleName', 'groupId', 'groupName', 'action'],
        properties: {
          id: { type: 'string', description: 'UUID права.' },
          roleId: { type: 'string', description: 'UUID роли.' },
          roleName: { type: 'string', description: 'Имя роли.' },
          groupId: { type: 'string', description: 'UUID группы объектов.' },
          groupName: { type: 'string', description: 'Имя группы.' },
          action: {
            type: 'string',
            enum: ['read', 'write', 'delete', 'stream', 'list'],
            description: 'Действие над объектами группы.',
          },
        },
      },
      AuditEntry: {
        type: 'object',
        description: 'Запись аудит-лога.',
        required: ['id', 'createdAt', 'action', 'details'],
        properties: {
          id: { type: 'string', description: 'UUID записи.' },
          createdAt: { type: 'string', format: 'date-time' },
          actorId: { type: 'string', nullable: true, description: 'UUID актора.' },
          actorName: { type: 'string', nullable: true, description: 'Имя актора.' },
          action: { type: 'string', description: 'Тип события (user.create, role.delete и т.п.).' },
          targetType: { type: 'string', nullable: true, description: 'Тип объекта действия.' },
          targetId: { type: 'string', nullable: true, description: 'UUID объекта действия.' },
          details: { type: 'object', description: 'Произвольные дополнительные данные события.' },
        },
      },
      RoleAssign: {
        type: 'object',
        description: 'Полный новый набор ролей пользователя (заменяет текущий).',
        required: ['roleNames'],
        properties: {
          roleNames: {
            type: 'array',
            description: 'Имена ролей, которые должны быть у пользователя.',
            items: { type: 'string' },
          },
        },
      },
      PermissionEntries: {
        type: 'object',
        description: 'Полный новый набор прав роли (заменяет текущий).',
        required: ['entries'],
        properties: {
          entries: {
            type: 'array',
            items: {
              type: 'object',
              required: ['groupId', 'action'],
              properties: {
                groupId: {
                  type: 'string',
                  format: 'uuid',
                  description: 'UUID группы объектов.',
                },
                action: {
                  type: 'string',
                  enum: ['read', 'write', 'delete', 'stream', 'list'],
                  description: 'Действие, разрешаемое на объектах группы.',
                },
              },
            },
          },
        },
      },
      AdminUserCreate: {
        type: 'object',
        required: ['username', 'email'],
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 32,
            description: 'Уникальный логин пользователя.',
          },
          email: { type: 'string', format: 'email' },
          password: {
            type: 'string',
            minLength: 12,
            description:
              'Пароль. Если не указан (или пуст) — генерируется временный и возвращается один раз в initialPassword.',
          },
        },
      },
      NameInput: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            pattern: '^[a-z][a-z0-9_-]{1,30}$',
            description:
              'Имя роли/группы: от 2 до 31 символа, латиница в нижнем регистре, цифры, "_" или "-", начинается с буквы.',
          },
        },
      },
      ObjectIds: {
        type: 'object',
        description: 'Полный новый состав объектов группы (заменяет текущий).',
        required: ['objectIds'],
        properties: {
          objectIds: {
            type: 'array',
            description: 'UUID объектов, входящих в группу.',
            items: { type: 'string', format: 'uuid' },
          },
        },
      },
      PasswordSet: {
        type: 'object',
        description:
          'Пароль для установки. Если не указан (или пуст) — генерируется временный и возвращается один раз в initialPassword.',
        properties: {
          password: {
            type: 'string',
            minLength: 12,
            description: 'Новый пароль пользователя.',
          },
        },
      },
      AdminUserPatch: {
        type: 'object',
        description:
          'Частичное обновление пользователя админом; хотя бы одно из полей обязательно. Пароль через этот эндпоинт менять нельзя.',
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 32,
            description: 'Уникальный логин пользователя.',
          },
          email: { type: 'string', format: 'email' },
        },
      },
    },
  },
};

const options: swaggerJsdoc.OAS3Options = {
  definition,
  apis: ['src/security/auth.routes.ts', 'src/routes/index.ts', 'src/routes/*.ts'],
};

/** Спека генерируется один раз при импорте модуля. */
export const openapiSpec = swaggerJsdoc(options);
