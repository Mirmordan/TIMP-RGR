import { config } from '../config';
import { pool } from '../database/connection';
import { runWithUser } from '../security/dbBridge';
import { processRepository } from '../repositories/process.repository';
import { segmentRepository } from '../repositories/segment.repository';
import { processService } from './process.service';
import { segmentService } from './segment.service';
import { mediaManager } from '../media/mediaManager';

/**
 * Стартовая реконсиляция «висящих» записей после аварийного завершения сервисов.
 *
 * Сценарий: backend упал/убит, процессы остались в БД со status='running' и
 * открытыми сегментами, а ffmpeg-manager(:9999)/mediaMTX(:9997) могли умереть
 * вместе с ним (или пережить рестарт). reconcileOnStartup() на старте приводит
 * БД к фактическому состоянию медиа-сервисов:
 *   - путь process_<id> найден в живом сервисе → запись продолжается, статус не
 *     трогаем (восстанавливаем только отсутствующий открытый сегмент, если краш
 *     случился между start() и createOpen());
 *   - пути нет, а сервис жив → экстренный stop существующим патч-путём
 *     (процесс → stopped, открытый сегмент финализуется по последнему .ts);
 *   - орфанные пути process_* без живой записи → удаляются из медиа-сервиса
 *     (защита от «призрачной» записи, жрущей диск и ffmpeg-процесс).
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
async function findSystemAdminId(): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'admin'
     ORDER BY u.username
     LIMIT 1`,
  );
  return rows[0]?.id ?? null;
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

/** Удалить из медиа-сервиса пути process_*, не относящиеся к живым записям. */
async function removeOrphanPaths(svc: ServicePaths, aliveIds: Set<string>): Promise<void> {
  if (!svc.ok) return; // сервис недоступен — список неавторитетен, пути не трогаем
  for (const name of svc.paths) {
    const m = /^process_(.+)$/.exec(name);
    if (!m) continue; // чужие пути (camera_* и пр.) не трогаем
    const processId = m[1]!;
    if (aliveIds.has(processId)) continue; // живая запись
    try {
      await mediaManager.removePath(name, undefined, svc.apiUrl);
      console.log(`[reconcile] орфанный путь ${name} удалён из ${svc.label}`);
    } catch (e: any) {
      console.warn(`[reconcile] не удалось удалить орфанный путь ${name}: ${e?.message ?? e}`);
    }
  }
}

export const recoveryService = {
  /**
   * Стартовая реконсиляция записей. Вызывается после app.listen без ожидания;
   * НИКОГДА не роняет сервер (вся логика в try/catch).
   */
  async reconcileOnStartup(): Promise<void> {
    try {
      const adminId = await findSystemAdminId();
      if (!adminId) {
        console.warn('[reconcile] в системе нет админа — системный скан записей пропущен');
        return;
      }
      console.log(`[reconcile] реконсиляция записей (системный контекст: ${adminId})`);
      await runWithUser(adminId, async () => {
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
};
