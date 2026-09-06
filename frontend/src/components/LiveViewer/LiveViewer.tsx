import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Button } from '../Button/Button';
import { apiFetch } from '../../api';
import styles from './LiveViewer.module.css';
import type { TimelineData, TimelineSegment as Segment } from '../../types';

// Живой HLS ffmpeg-manager'а (2с-сегменты, скользящее окно list_size 8, no-store).
// Источник не зависит от «открытого» VOD-сегмента — таймлайн-полл ниже нужен
// только чтобы решать «эфир vs завершён» и держать LiveViewer включённым.
// LIVE_SYNC_COUNT: liveSyncDurationCount — держимся в ~3 сегментах (≈6с) от края.
const LIVE_SYNC_COUNT = 3;
// EDGE_PREROLL_S: отступ от seekable.end при прыжке в живой край (кнопка LIVE):
// не упираться ровно в последний, ещё пишущийся чанк.
const EDGE_PREROLL_S = 2;
// BACK_BUFFER_S: сколько сыгранного буфера держать в MSE. Дефолт hls.js = Infinity
// — без лимита многочасовой эфир накапливает гигабайты в памяти вкладки.
const BACK_BUFFER_S = 30;
const TIMELINE_POLL_MS = 5000;
// Watch-цикл recovery: каждые WATCH_MS проверяем «живость» воспроизведения.
const WATCH_MS = 2000;
// N плохих циклов подряд → hls.recoverMediaError().
const STALL_RECOVER_CYCLES = 5;
// Ещё N плохих циклов после recovery → destroy + пересоздание инстанса с ?t=Date.now().
const STALL_RECREATE_CYCLES = 10;
// Подряд fatal NETWORK_ERROR (не 404) на инстансе → оверлей «нет сигнала» и destroy.
const FATAL_NET_LIMIT = 3;
// Пауза перед автоматической попыткой пересоздать инстанс после fatal-сдачи.
const RETRY_AFTER_FATAL_MS = 8000;

interface LiveViewerProps {
  processId: string;
}

export function LiveViewer({ processId }: LiveViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  // PDT текущего играемого фрагмента: точный таймкод «в эфире» считаем от реального
  // PROGRAM-DATE-TIME (в манифесте ffm его пока нет — путь «спит» до добавления
  // hls_flags program_date_time). media-таймлайн для таймкода не годится: слайдинг
  // окна и пересоздания ffm-HLS рвут соответствие media-time ↔ wall-clock.
  const fragMetaRef = useRef<{ pdtMs: number; start: number } | null>(null);
  const emptyPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userPausedRef = useRef(false);
  const autoplayBlockedRef = useRef(false);
  const stallStreakRef = useRef(0);
  const fatalNetRef = useRef(0);
  const retryAtRef = useRef(0);
  const lastChunkTsRef = useRef<number | null>(null);
  const startHlsRef = useRef<(cacheBust: boolean) => void>(() => {});

  // timeline.live (процесс running) и открытый (endedAt === null) сегмент — источник истины.
  const [isLive, setIsLive] = useState(true);
  const [openSeg, setOpenSeg] = useState<Segment | null>(null);
  const [waiting, setWaiting] = useState(false); // running, но открытого сегмента ещё нет
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false); // манифест грузится / пересоздание
  const [emptyWait, setEmptyWait] = useState(false); // ffm-HLS ещё нет (404) / пуст
  const [noSignal, setNoSignal] = useState(false); // fatal network/other за лимитом
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [muted, setMuted] = useState(true);
  const [edgeClock, setEdgeClock] = useState('');
  const [liveTimeLabel, setLiveTimeLabel] = useState('');
  const [liveLagLabel, setLiveLagLabel] = useState('');

  // 1с-тикер (edge clock + статус эфира) создаётся один раз и читает свежие значения через рефы.
  const noSignalRef = useRef(false);
  const emptyWaitRef = useRef(false);
  useEffect(() => {
    noSignalRef.current = noSignal;
    emptyWaitRef.current = emptyWait;
  }, [noSignal, emptyWait]);

  // Активная live-секция (video смонтировано): нужно для зачистки по unmount.
  const liveActive = isLive && !waiting && !!openSeg;

  // --- Поллинг таймлайна: ловим конец трансляции / появление открытого сегмента ---
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await apiFetch(`/segments/process/${processId}/timeline`);
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as TimelineData;
        const live = data.live === true;
        let open: Segment | null = null;
        for (const s of data.segments) {
          if (s.endedAt === null) {
            if (!open || new Date(s.startedAt).getTime() > new Date(open.startedAt).getTime()) open = s;
          }
        }
        setIsLive(live);
        setWaiting(live && !open);
        setOpenSeg(open);
      } catch {
        // Сетевой сбой поллинга: плеер живёт на текущем инстансе, повторим на след. тике.
      }
    };

    load();
    const timer = setInterval(load, TIMELINE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [processId]);

  // --- 1с-тикер: edge clock + статус/отставание эфира ---
  useEffect(() => {
    const tick = () => {
      const ts = lastChunkTsRef.current;
      if (ts === null) {
        setEdgeClock('--:--:--');
      } else {
        const d = new Date(ts);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        setEdgeClock(`${hh}:${mm}:${ss}`);
      }

      const v = videoRef.current;
      if (!v || v.currentTime <= 0 || noSignalRef.current || emptyWaitRef.current) {
        setLiveTimeLabel('');
        setLiveLagLabel('');
        return;
      }

      // Точный таймкод кадра — от реального PDT играемого фрагмента
      // (pdt + (currentTime − начало флага)). PDT в манифесте ffm пока нет —
      // ветка «спит» до добавления program_date_time в ffm-HLS команду.
      const meta = fragMetaRef.current;
      if (meta && Number.isFinite(meta.pdtMs) && Number.isFinite(meta.start)) {
        const frameMs = meta.pdtMs + (v.currentTime - meta.start) * 1000;
        const d = new Date(frameMs);
        const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
        const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        setLiveTimeLabel(`в эфире ${date} ${clock}`);
        if (!v.paused) {
          const lag = Math.max(0, Math.round((Date.now() - frameMs) / 1000));
          setLiveLagLabel(`≈${lag}с задержка`);
        } else {
          setLiveLagLabel('');
        }
        return;
      }

      // PDT нет (сейчас) — точный wall-clock кадра неизвестен. Не выдумываем секунды:
      // показываем честный статус эфира и отставание playhead от края окна (seekable.end − ct).
      setLiveTimeLabel('прямой эфир');
      if (!v.paused) {
        let se = 0;
        for (let i = 0; i < v.seekable.length; i++) se = Math.max(se, v.seekable.end(i));
        if (se > 0 && v.currentTime < se) {
          setLiveLagLabel(`×${Math.max(0, Math.round(se - v.currentTime))}с от края`);
        } else {
          setLiveLagLabel('');
        }
      } else {
        setLiveLagLabel('');
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  function teardownHls() {
    if (emptyPollTimerRef.current) {
      clearTimeout(emptyPollTimerRef.current);
      emptyPollTimerRef.current = null;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }

  function scheduleEmptyPoll(hls: Hls) {
    if (emptyPollTimerRef.current) return;
    emptyPollTimerRef.current = setTimeout(() => {
      emptyPollTimerRef.current = null;
      // Инстанс ещё жив — переспрашиваем (ffm-HLS может появиться в любой момент).
      if (hlsRef.current === hls) {
        hls.startLoad();
      }
    }, 2000);
  }

  function attemptPlay() {
    const v = videoRef.current;
    if (!v || userPausedRef.current || autoplayBlockedRef.current) return;
    const p = v.play();
    if (!p) return;
    p.then(() => {
      autoplayBlockedRef.current = false;
      setAutoplayBlocked(false);
      setPlaying(true);
    }).catch((err) => {
      // NotAllowedError = политика автоплея (в т.ч. unmuted после автоматического
      // пересоздания инстанса); Abort/NotSupported — транзиентные до данных.
      if (err?.name === 'NotAllowedError') {
        autoplayBlockedRef.current = true;
        setAutoplayBlocked(true);
        setPlaying(false);
      }
    });
  }

  function startHls(cacheBust: boolean) {
    const video = videoRef.current;
    if (!video) return;
    teardownHls();
    stallStreakRef.current = 0;
    fatalNetRef.current = 0;
    retryAtRef.current = 0;
    setNoSignal(false);
    setEmptyWait(false);
    setLoading(true);
    setPlaying(false);

    // Нативный живой HLS ffmpeg-manager'а. query-bust не влияет на express.static
    // (отдаёт тот же файл), но no-store уже гарантирует свежий манифест на каждый
    // реквест — ?t= оставлен как страховка и для новой media-сессии после recreate.
    const src = `/hls/process_${processId}/index.m3u8${cacheBust ? `?t=${Date.now()}` : ''}`;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        // Нативный live: duration = live-окно (hls сам держит край слайдингом окна),
        // liveSyncDurationCount (≈6с) задаёт точку синхронизации; max-latency ресинк
        // остаётся на дефолте hls.js (liveMaxLatencyDurationCount: Infinity).
        liveDurationInfinity: true,
        liveSyncDurationCount: LIVE_SYNC_COUNT,
        // MSE без этого растёт бесконечно: сыгранный буфер НЕ вытесняется
        // (дефолт Infinity) — много часов эфира = гигабайты в браузере.
        backBufferLength: BACK_BUFFER_S,
        maxBufferLength: 20,
        startLevel: -1,
      });

      const resetHealth = () => {
        stallStreakRef.current = 0;
        fatalNetRef.current = 0;
        setNoSignal(false);
      };

      const giveUp = () => {
        // Fatal за лимитом: гасим инстанс — сторожевик (или клик по оверлею)
        // пересоздаст его с cache-buster'ом через RETRY_AFTER_FATAL_MS.
        setNoSignal(true);
        setLoading(false);
        setPlaying(false);
        teardownHls();
        video.pause();
        video.removeAttribute('src');
        video.load();
        retryAtRef.current = Date.now() + RETRY_AFTER_FATAL_MS;
      };

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        resetHealth();
        setLoading(false);
        setEmptyWait(false);
        attemptPlay();
      });

      hls.on(Hls.Events.LEVEL_LOADED, (_e, data) => {
        resetHealth();
        const frags = data?.details?.fragments?.length ?? 0;
        setLoading(false);
        if (frags > 0) {
          // Манифест пришёл с данными — стартуем воспроизведение.
          setEmptyWait(false);
          attemptPlay();
        } else {
          setEmptyWait(true);
        }
      });

      hls.on(Hls.Events.FRAG_BUFFERED, (_e, data) => {
        resetHealth();
        lastChunkTsRef.current = Date.now();
        const f = (data as { frag?: { programDateTime?: number; start?: number } } | undefined)?.frag;
        if (f && typeof f.programDateTime === 'number' && typeof f.start === 'number') {
          fragMetaRef.current = { pdtMs: f.programDateTime, start: f.start };
        }
      });

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data?.fatal) {
          if (data?.details === Hls.ErrorDetails.LEVEL_EMPTY_ERROR) setEmptyWait(true);
          return;
        }
        // Живой ffm-HLS по пути ещё нет (создаётся/пересоздаётся после реконнекта WS):
        // 404 — не «поломка», а ожидание данных — переспрашиваем, пока манифест не появится.
        const status = (data as { response?: { code?: number } } | undefined)?.response?.code;
        if (data?.type === Hls.ErrorTypes.NETWORK_ERROR && status === 404) {
          setEmptyWait(true);
          setLoading(false);
          scheduleEmptyPoll(hls);
          return;
        }
        if (data?.type === Hls.ErrorTypes.NETWORK_ERROR) {
          fatalNetRef.current += 1;
          if (fatalNetRef.current >= FATAL_NET_LIMIT) giveUp();
          else hls.startLoad();
        } else if (data?.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          giveUp();
        }
      });

      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari fallback: нативный HLS.
      video.src = src;
      setLoading(false);
      attemptPlay();
    } else {
      setLoading(false);
      setNoSignal(true);
    }
  }
  // Актуальный startHls для сторожевика (создаётся заново каждый рендер).
  useEffect(() => {
    startHlsRef.current = startHls;
  });

  // --- Синхронизация HLS-инстанса с live-статусом ---
  useEffect(() => {
    if (!liveActive) {
      teardownHls();
      return;
    }
    startHls(false);
    return () => teardownHls();
    // eslint-стиль проекта: старт/стоп на переходе «неактив→актив»; смена id открытого
    // сегмента или поллинг НЕ должны рвать живое воспроизведение (src от сегмента не зависит).
  }, [liveActive]);

  // --- Watchdog: stall → recoverMediaError → destroy+recreate (?t=Date.now()) ---
  useEffect(() => {
    if (!liveActive) return;
    const timer = setInterval(() => {
      const v = videoRef.current;
      if (!v) return;
      // Пользователь сам управляет паузой / автоплей ещё не разрешён — не лечим.
      if (userPausedRef.current || autoplayBlockedRef.current) return;
      // Ждём данные (404/пустой манифест) — переспрос идёт в ERROR-ветке, не мешаем.
      if (emptyWaitRef.current) return;

      const hls = hlsRef.current;
      if (!hls) {
        // Инстанс убит fatal-ошибкой: ждём таймаут и пробуем свежий с cache-buster.
        if (Date.now() >= retryAtRef.current) {
          retryAtRef.current = Date.now() + RETRY_AFTER_FATAL_MS;
          startHlsRef.current(true);
        }
        return;
      }

      let bufferedEnd = 0;
      for (let i = 0; i < v.buffered.length; i++) {
        const e = v.buffered.end(i);
        if (e > bufferedEnd) bufferedEnd = e;
      }
      const healthy = !v.paused && v.readyState >= 2 && bufferedEnd - v.currentTime > 0.3;

      if (healthy) {
        stallStreakRef.current = 0;
        // Нативный live hls.js сам держит край (liveSync + слайдинг окна) —
        // ручного догона/ре-якоря больше не нужно.
        return;
      }

      stallStreakRef.current += 1;
      if (stallStreakRef.current >= STALL_RECREATE_CYCLES) {
        // Воспроизведение так и не поехало после recoverMediaError — пересоздаём инстанс.
        stallStreakRef.current = 0;
        retryAtRef.current = Date.now() + 3000;
        startHlsRef.current(true);
      } else if (stallStreakRef.current >= STALL_RECOVER_CYCLES) {
        hls.recoverMediaError();
      }
    }, WATCH_MS);
    return () => clearInterval(timer);
  }, [liveActive]);

  // --- Unmount / выход из live-вида: полная зачистка hls + <video> ---
  useEffect(() => {
    if (!liveActive) return;
    const v = videoRef.current;
    return () => {
      teardownHls();
      if (v) {
        v.pause();
        v.removeAttribute('src');
        v.load();
      }
    };
  }, [liveActive]);

  // --- Контролы ---
  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      userPausedRef.current = false;
      autoplayBlockedRef.current = false;
      setAutoplayBlocked(false);
      attemptPlay();
    } else {
      v.pause();
      userPausedRef.current = true;
      setPlaying(false);
    }
  }

  function startFromOverlay() {
    const v = videoRef.current;
    if (!v) return;
    // Клик — жест пользователя: снимаем mute и играем со звуком.
    v.muted = false;
    setMuted(false);
    userPausedRef.current = false;
    autoplayBlockedRef.current = false;
    setAutoplayBlocked(false);
    attemptPlay();
  }

  function jumpToLive() {
    const v = videoRef.current;
    const hls = hlsRef.current;
    if (!v || !hls) return;
    // Клик — жест пользователя: снимаем флаги паузы/блокировки автоплея.
    userPausedRef.current = false;
    autoplayBlockedRef.current = false;
    setAutoplayBlocked(false);
    // Живой край — это seekable.end буфера; liveSyncPosition врёт при пустом seekable.
    let seekEnd = 0;
    for (let i = 0; i < v.seekable.length; i++) {
      const e = v.seekable.end(i);
      if (e > seekEnd) seekEnd = e;
    }
    const pos = seekEnd > 0 ? Math.max(0, seekEnd - EDGE_PREROLL_S) : hls.liveSyncPosition;
    if (pos != null && Number.isFinite(pos)) {
      try {
        v.currentTime = Math.max(0, pos);
      } catch {
        // seek вне диапазона — игнорируем
      }
    } else {
      try {
        const bl = v.buffered;
        if (bl.length > 0) {
          v.currentTime = Math.max(0, bl.end(bl.length - 1) - 3);
        }
      } catch {
        // ignore
      }
    }
    stallStreakRef.current = 0;
    attemptPlay();
  }

  function toggleFullscreen() {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  function retryNow() {
    startHls(true);
  }

  // Трансляция завершена (процесс не running): родитель вскоре размонтирует
  // LiveViewer и покажет архив в CustomPlayer — кнопка лишь подтверждает это.
  if (!isLive) {
    return (
      <div className={styles.root}>
        <div className={styles.centerState}>
          <span className={styles.endedDot}>●</span>
          <div className={styles.centerStateTitle}>Трансляция завершена</div>
          <div className={styles.centerStateSub}>Идёт переход к просмотру записи…</div>
          <Button variant="outline" size="sm" onClick={() => {}}>
            Смотреть запись
          </Button>
        </div>
      </div>
    );
  }

  if (waiting || !openSeg) {
    return (
      <div className={styles.root}>
        <div className={styles.centerState}>
          <span className={styles.spinner} />
          <div className={styles.centerStateTitle}>Запись начинается</div>
          <div className={styles.centerStateSub}>Ожидание первого сегмента…</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.topbar}>
        <span className={styles.liveBadge}>
          <span className={styles.liveDot} />
          LIVE
        </span>
        <span className={styles.topRight}>
          {!noSignal && !emptyWait && liveTimeLabel && (
            <>
              <span className={styles.liveNow}>{liveTimeLabel}</span>
              {liveLagLabel && <span className={styles.liveLag}>{liveLagLabel}</span>}
            </>
          )}
          <span className={styles.topClock}>последний чанк {edgeClock}</span>
        </span>
      </div>

      <div className={styles.videoBox}>
        <video ref={videoRef} className={styles.video} muted playsInline onClick={togglePlay} />

        {noSignal && (
          <div className={`${styles.overlay} ${styles.noSignal}`} onClick={retryNow} title="Нажмите, чтобы переподключиться">
            <span className={styles.spinner} />
            Нет сигнала
            <span className={styles.noSignalHint}>Нажмите, чтобы переподключиться</span>
          </div>
        )}

        {!noSignal && autoplayBlocked && (
          <div className={styles.overlay} onClick={startFromOverlay}>
            <span className={styles.playBtn}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,4 20,12 6,20" />
              </svg>
            </span>
            <span className={styles.playLabel}>Нажмите для воспроизведения</span>
          </div>
        )}

        {!noSignal && !autoplayBlocked && loading && (
          <div className={styles.overlay}>
            <span className={styles.spinner} />
            Подключение…
          </div>
        )}

        {!noSignal && !autoplayBlocked && !loading && !playing && emptyWait && (
          <div className={styles.overlay}>
            <span className={styles.spinner} />
            Запись идёт, ждём данные…
          </div>
        )}
      </div>

      <div className={styles.controls}>
        <button className={styles.btn} onClick={togglePlay} title={playing ? 'Пауза' : 'Воспроизведение'}>
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        <button className={styles.btn} onClick={toggleMute} title={muted ? 'Включить звук' : 'Выключить звук'}>
          {muted ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          )}
        </button>

        <div className={styles.rightBtns}>
          <button className={styles.liveGo} onClick={jumpToLive} title="Перейти к последнему кадру трансляции">
            LIVE
          </button>
          <button className={styles.btn} onClick={toggleFullscreen} title="Полный экран">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
