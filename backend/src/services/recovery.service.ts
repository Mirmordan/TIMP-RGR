import { config } from '../config';
import { pool } from '../database/connection';
import { runWithUser } from '../security/dbBridge';
import { processRepository, type RunningProcessWithStream } from '../repositories/process.repository';
import { segmentRepository } from '../repositories/segment.repository';
import { processService } from './process.service';
import { segmentService } from './segment.service';
import { mediaManager } from '../media/mediaManager';
import { auditService } from './audit.service';

/**
 * Стартовая реконсиляция «висящих» записей после аварийного завершения сервисов
 * + фоновый watchdog «живости» записей (checkStalledRecordings, тик от startWatchdog).
 *
 * Реконсиляция. Сценарий: backend упал/убит, процессы остались в БД со
 * status='running' и открытыми сегментами, а ffmpeg-manager(:9999)/mediaMTX(:9997)
 * могли умереть вместе с ним (или пережить рестарт). reconcileOnStartup() на старте
 * приводит БД к фактическому состоянию медиа-сервисов:
 *   - путь process_<id> найден в живом сервисе → запись продолжается, статус не
 *     трогаем (восстанавливаем только отсутствующий открытый сегмент, если краш
 *     случился между start() и createOpen());
 *   - пути нет, а сервис жив → экстренный stop существующим патч-путём
 *     (процесс → stopped, открытый сегмент финализуется по последнему .ts);
 *   - орфанные пути process_* без живой записи → удаляются из медиа-сервиса
 *     (защита от «призрачной» записи, жрущей диск и ffmpeg-процесс).
 *
 * Watchdog. Сценарий: источник оборвался, но путь в медиа-сервисе остался — запись
 * числится running, сегмент открыт, а .ts в него больше не пишутся (растёт в пустоту,
 * таймлайн врёт). Раз в WATCHDOG_TICK_S такие записи экстренно оформляются как failed
 * (тот же штатный патч-путь: стоп потока в медиа-сервисе + финализация сегмента по
 * последнему фактическому .ts), о чём пишется в audit_log.
 *
 * RLS: на boot авторизованного юзера нет, а FORCE RLS без app.user_id скрывает
 * все объектные строки. Скан выполняется в контексте системного админа
 * (admin видит все объекты) через runWithUser() — тот же механизм, что у
 * middleware authenticate. Если админов в системе нет — скан пропускается.
 */

/** Таймаут GET списка путей медиа-менеджера. */
const PATHS_LIST_TIMEOUT_MS = 2000;

/**
 * Эндпоинт списка путей, общий для ffmpeg-manager и mediaMTX: оба отвечают
 * { items: [{ name }] }. У mediaMTX есть также /v3/config/paths/list, но
 * ffmpeg-manager регистрирует только /v3/paths/list — берём общий.
 */
const PATHS_LIST_ENDPOINT = '/v3/paths/list';

/** Grace-период «тишины» .ts (сек): после него running-запись с открытым сегментом помечается failed. */
export const STALL_GRACE_S = config.watchdog.stallGraceS;
/** Период тика watchdog (сек). */
export const WATCHDOG_TICK_S = config.watchdog.tickS;
const WATCHDOG_TICK_MS = WATCHDOG_TICK_S * 1000;

interface ServicePaths {
  apiUrl: string;
  label: string;
  /** HTTP-ответ получен и распарсен (сервис жив и отдал список путей). */
  ok: boolean;
  paths: Set<string>;
}

/** GET список путей медиа-менеджера с таймаутом; сетевой сбой/HTTP-ошибка → { ok:false }. */
async function fetchServicePaths(apiUrl: string, label: string): Promise<ServicePaths> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PATHS_LIST_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiUrl}${PATHS_LIST_ENDPOINT}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[reconcile] ${label} (${apiUrl}): HTTP ${res.status} на ${PATHS_LIST_ENDPOINT} — список неавторитетен`);
      return { apiUrl, label, ok: false, paths: new Set() };
    }
    const data = (await res.json()) as { items?: Array<{ name?: string }> };
    const paths = new Set<string>();
    for (const item of data.items ?? []) {
      if (item && typeof item.name === 'string') paths.add(item.name);
    }
    return { apiUrl, label, ok: true, paths };
  } catch (e: any) {
    const reason = e?.name === 'AbortError' ? 'таймаут 2s' : (e?.message ?? String(e));
    console.warn(`[reconcile] ${label} (${apiUrl}) недоступен (${reason}) — процессы не трогаем`);
    return { apiUrl, label, ok: false, paths: new Set() };
  } finally {
    clearTimeout(timer);
  }
}

/** Любой админ системы (RLS-free таблицы) — контекст для системного скана записей. */
async function findSystemAdmin(): Promise<{ id: string; username: string } | null> {
  const { rows } = await pool.query<{ id: string; username: string }>(
    `SELECT u.id, u.username
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'admin'
     ORDER BY u.username
     LIMIT 1`,
  );
  return rows[0] ?? null;
}

/** Привести running-процессы к факту по спискам путей медиа-сервисов. */
async function reconcileRunning(ffm: ServicePaths, mtx: ServicePaths): Promise<void> {
  const running = await processRepository.findRunningWithStream();
  console.log(`[reconcile] найдено running-процессов: ${running.length}`);

  // Процессы, чей путь жив в медиа-сервисе: их process_* пути НЕ удалять при чистке сирот.
  const aliveIds = new Set<string>();

  for (const proc of running) {
    const mtxPath = `process_${proc.id}`;
    const svc = proc.streamUrl.startsWith('ivideon://') ? ffm : mtx;

    if (!svc.ok) {
      // Сервис недоступен сетью/по HTTP: список путей неавторитетен — процесс не
      // стопаем: запись могла выжить, а минутное падение nginx не должно убить живые записи.
      console.warn(`[reconcile] процесс ${proc.id}: ${svc.label} недоступен — оставляем running`);
      continue;
    }

    if (svc.paths.has(mtxPath)) {
      // Путь жив: медиа-сервис пережил рестарт бэкенда — запись продолжает литься.
      aliveIds.add(proc.id);
      const segments = await segmentRepository.findByProcess(proc.id);
      const openSeg = segments.find(s => s.endedAt === null);
      if (!openSeg && segments.length === 0) {
        // Краш между start() и createOpen(): открытый сегмент так и не создался —
        // восстанавливаем от process.startedAt (начало живой записи).
        try {
          await segmentService.createOpen(proc.id, proc.streamId, mtxPath, proc.startedAt);
          console.log(`[reconcile] процесс ${proc.id}: путь найден в ${svc.label}, открытый сегмент отсутствовал — создан`);
        } catch (e: any) {
          console.warn(`[reconcile] процесс ${proc.id}: не удалось создать открытый сегмент: ${e?.message ?? e}`);
        }
      } else if (!openSeg) {
        // Есть только закрытые сегменты (краш между resume и createOpen): старт
        // текущего окна неизвестен — не выдумываем данные, оставляем как есть.
        console.warn(`[reconcile] процесс ${proc.id}: путь найден, но открытого сегмента нет (есть закрытые) — не восстанавливаем`);
      } else {
        console.log(`[reconcile] процесс ${proc.id}: путь найден в ${svc.label} — запись продолжается, статус не меняем`);
      }
    } else {
      // Пути нет при живом сервисе → источник оборвался вместе с падением: экстренный stop.
      try {
        await processService.patch(proc.id, { status: 'stopped' });
        console.log(`[reconcile] процесс ${proc.id}: путь не найден в ${svc.label} — завершён (stopped, сегменты финализованы)`);
      } catch (e: any) {
        console.error(`[reconcile] процесс ${proc.id}: не удалось завершить: ${e?.message ?? e}`);
      }
    }
  }

  await removeOrphanPaths(ffm, aliveIds);
  await removeOrphanPaths(mtx, aliveIds);
}

/** Удалить из медиа-сервиса орфанные пути: process_* без живой записи и все view_*. */
async function removeOrphanPaths(svc: ServicePaths, aliveIds: Set<string>): Promise<void> {
  if (!svc.ok) return; // сервис недоступен — список неавторитетен, пути не трогаем
  for (const name of svc.paths) {
    const m = /^process_(.+)$/.exec(name);
    const isView = /^view_/.test(name);
    if (!m && !isView) continue; // чужие пути (camera_* и пр.) не трогаем
    if (m && aliveIds.has(m[1]!)) continue; // живая запись
    // view_* пути: TTL-карта view-сессий живёт в памяти бэкенда — рестарт бэкенда
    // осиротил их все (записи они не ведутся и в state не персистятся).
    try {
      await mediaManager.removePath(name, undefined, svc.apiUrl);
      console.log(`[reconcile] орфанный путь ${name} удалён из ${svc.label}`);
    } catch (e: any) {
      console.warn(`[reconcile] не удалось удалить орфанный путь ${name}: ${e?.message ?? e}`);
    }
  }
}

let watchdogTimer: ReturnType<typeof setInterval> | null = null;

/** Проверить один running-процесс: давно ли не пополняется его открытый сегмент. */
async function checkProcessForStall(proc: RunningProcessWithStream, admin: { id: string; username: string }): Promise<void> {
  const segments = await segmentRepository.findByProcess(proc.id);
  const openSeg = segments.find(s => s.endedAt === null);
  if (!openSeg) return; // открытого сегмента нет — случай стартовой реконсиляции, не watchdog'а

  // Последние фактические данные: последний .ts в директории сегмента; файлов ещё
  // нет (подключение источника занимает десятки секунд) — момент открытия сегмента.
  const lastFile = segmentService.lastFileTs(openSeg.path);
  const lastTs = lastFile ?? new Date(openSeg.startedAt);
  const idleMs = Date.now() - lastTs.getTime();
  if (idleMs <= STALL_GRACE_S * 1000) return; // чанки пишутся / сегмент создан недавно — запись жива

  console.warn(`[watchdog] процесс ${proc.id}: в открытый сегмент не пишутся .ts дольше ${STALL_GRACE_S}s (последние данные: ${lastTs.toISOString()}) — помечаю failed`);
  await markProcessStalled(proc.id, admin, lastTs);
}

/** Экстренно оформить зависшую запись: failed штатным патч-путём + audit-запись. */
async function markProcessStalled(processId: string, admin: { id: string; username: string }, lastTs: Date): Promise<void> {
  // Штатный патч-путь: останавливает поток в медиа-сервисе (removePath — иначе ffmpeg
  // продолжит лить в «закрытый» процесс) и финализирует открытый сегмент по последнему .ts.
  const updated = await processService.patch(processId, { status: 'failed' });
  if (!updated) {
    console.warn(`[watchdog] процесс ${processId}: уже удалён — пропускаю аудит`);
    return;
  }
  await auditService.logAudit({
    actorId: admin.id,
    actorName: admin.username,
    action: 'recording.watchdog.stalled',
    targetType: 'recording_process',
    targetId: processId,
    details: { processId, lastTs: lastTs.toISOString() },
  });
}

export const recoveryService = {
  /**
   * Стартовая реконсиляция записей. Вызывается после app.listen без ожидания;
   * НИКОГДА не роняет сервер (вся логика в try/catch).
   */
  async reconcileOnStartup(): Promise<void> {
    try {
      const admin = await findSystemAdmin();
      if (!admin) {
        console.warn('[reconcile] в системе нет админа — системный скан записей пропущен');
        return;
      }
      console.log(`[reconcile] реконсиляция записей (системный контекст: ${admin.id})`);
      await runWithUser(admin.id, async () => {
        const [ffm, mtx] = await Promise.all([
          fetchServicePaths(config.ffmpegManager.apiUrl, 'ffmpeg-manager'),
          fetchServicePaths(config.mediaMTX.apiUrl, 'mediaMTX'),
        ]);
        await reconcileRunning(ffm, mtx);
      });
      console.log('[reconcile] реконсиляция завершена');
    } catch (e: any) {
      console.error(`[reconcile] ошибка реконсиляции (сервер продолжает работу): ${e?.message ?? e}`);
    }
  },

  /**
   * Watchdog «живости» записей (итерация). Каждый running-процесс с открытым
   * сегментом, в который не пишутся новые .ts дольше STALL_GRACE_S (источник
   * умер, а путь в ffmpeg-manager/mediaMTX остался — сегмент «растёт в пустоту»),
   * экстренно оформляется как failed. Идемпотентна; ошибки одного процесса не
   * мешают остальным; НИКОГДА не роняет сервер (вся логика в try/catch).
   */
  async checkStalledRecordings(): Promise<void> {
    try {
      const admin = await findSystemAdmin();
      if (!admin) {
        console.warn('[watchdog] в системе нет админа — проверка «живости» записей пропущена');
        return;
      }
      await runWithUser(admin.id, async () => {
        const running = await processRepository.findRunningWithStream();
        for (const proc of running) {
          try {
            await checkProcessForStall(proc, admin);
          } catch (e: any) {
            console.error(`[watchdog] процесс ${proc.id}: ошибка проверки (продолжаем со следующим): ${e?.message ?? e}`);
          }
        }
      });
    } catch (e: any) {
      console.error(`[watchdog] ошибка итерации (сервер продолжает работу): ${e?.message ?? e}`);
    }
  },

  /** Запустить периодическую проверку «живости» записей. Первый тик — через WATCHDOG_TICK_S. */
  startWatchdog(): ReturnType<typeof setInterval> {
    if (watchdogTimer) return watchdogTimer;
    watchdogTimer = setInterval(() => {
      void recoveryService.checkStalledRecordings();
    }, WATCHDOG_TICK_MS);
    console.log(`[watchdog] планировщик запущен: тик ${WATCHDOG_TICK_S}s, grace ${STALL_GRACE_S}s`);
    return watchdogTimer;
  },
};
