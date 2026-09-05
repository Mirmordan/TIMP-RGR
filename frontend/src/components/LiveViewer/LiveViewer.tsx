import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Button } from '../Button/Button';
import { apiFetch } from '../../api';
import styles from './LiveViewer.module.css';
import type { TimelineData, TimelineSegment as Segment } from '../../types';

// Preroll: сколько чанков (≈TARGETDURATION 2с) держаться за live-edge,
// чтобы старт не упирался ровно в последний (ещё пишущийся) чанк.
const LIVE_SYNC_DURATION_COUNT = 2;
const TIMELINE_POLL_MS = 5000;
// Watch-цикл recovery: каждые WATCH_MS проверяем «живость» воспроизведения.
const WATCH_MS = 2000;
// N плохих циклов подряд → hls.recoverMediaError().
const STALL_RECOVER_CYCLES = 5;
// Ещё N плохих циклов после recovery → destroy + пересоздание инстанса с ?t=Date.now().
const STALL_RECREATE_CYCLES = 10;
// Подряд fatal NETWORK_ERROR на инстансе → оверлей «нет сигнала» и destroy.
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
  const segIdRef = useRef<string | null>(null);
  const emptyPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userPausedRef = useRef(false);
  const autoplayBlockedRef = useRef(false);
  const stallStreakRef = useRef(0);
  const fatalNetRef = useRef(0);
  const retryAtRef = useRef(0);
  const lastChunkTsRef = useRef<number | null>(null);
  const startHlsRef = useRef<(segId: string, cacheBust: boolean) => void>(() => {});

  // timeline.live (процесс running) и открытый (endedAt === null) сегмент — источник истины.
  const [isLive, setIsLive] = useState(true);
  const [openSeg, setOpenSeg] = useState<Segment | null>(null);
  const [waiting, setWaiting] = useState(false); // running, но открытого сегмента ещё нет
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false); // манифест грузится / пересоздание
  const [emptyWait, setEmptyWait] = useState(false); // открыт, но чанков пока нет
  const [noSignal, setNoSignal] = useState(false); // fatal network/other за лимитом
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [muted, setMuted] = useState(true);
  const [edgeClock, setEdgeClock] = useState('');

  // Активная live-секция (video смонтировано): нужно для зачистки по unmount.
  const liveActive = isLive && !waiting && !!openSeg;

  // --- Поллинг таймлайна: ловим смену открытого сегмента / конец трансляции ---
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

  // --- Час «последнего чанка» (edge clock) ---
  useEffect(() => {
    const tick = () => {
      const ts = lastChunkTsRef.current;
      if (ts === null) {
        setEdgeClock('--:--:--');
        return;
      }
      const d = new Date(ts);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      setEdgeClock(`${hh}:${mm}:${ss}`);
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
      // Пока инстанс жив и сегмент не сменился — переспрашиваем пустой EVENT-манифест.
      if (hlsRef.current === hls && segIdRef.current) {
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

  function startHls(segId: string, cacheBust: boolean) {
    const video = videoRef.current;
    if (!video) return;
    teardownHls();
    segIdRef.current = segId;
    stallStreakRef.current = 0;
    fatalNetRef.current = 0;
    retryAtRef.current = 0;
    setNoSignal(false);
    setEmptyWait(false);
    setLoading(true);
    setPlaying(false);

    const base = `/api/v1/segments/${segId}/playlist`;
    const src = cacheBust ? `${base}?t=${Date.now()}` : base;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        liveDurationInfinity: true,
        liveSyncDurationCount: LIVE_SYNC_DURATION_COUNT,
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
          // Пустой EVENT-плейлист дождался первого чанка — стартуем воспроизведение.
          setEmptyWait(false);
          attemptPlay();
        } else {
          setEmptyWait(true);
        }
      });

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        resetHealth();
        lastChunkTsRef.current = Date.now();
      });

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data?.fatal) {
          if (data?.details === Hls.ErrorDetails.LEVEL_EMPTY_ERROR) setEmptyWait(true);
          return;
        }
        // Пустой EVENT-манифест открытого сегмента (чанки ещё не появились):
        // это не сбой — переспрашиваем поллингом и ждём первый .ts.
        if (data?.details === Hls.ErrorDetails.LEVEL_EMPTY_ERROR) {
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

  // --- Синхронизация HLS-инстанса с открытым сегментом ---
  useEffect(() => {
    const segId = isLive && openSeg ? openSeg.id : null;
    if (!segId) {
      teardownHls();
      return;
    }
    startHls(segId, false);
    return () => teardownHls();
    // eslint-стиль проекта: восстановление/пересоздание триггерится сменой id/статуса.
  }, [isLive, openSeg?.id]);

  // --- Watch-догон: stall → recoverMediaError → destroy+recreate (?t=Date.now()) ---
  useEffect(() => {
    if (!isLive || !openSeg) return;
    const timer = setInterval(() => {
      const v = videoRef.current;
      const segId = segIdRef.current;
      if (!v || !segId) return;
      // Пользователь сам управляет паузой / автоплей ещё не разрешён — не лечим.
      if (userPausedRef.current || autoplayBlockedRef.current) return;

      const hls = hlsRef.current;
      if (!hls) {
        // Инстанс убит fatal-ошибкой: ждём таймаут и пробуем свежий с cache-buster.
        if (Date.now() >= retryAtRef.current) {
          retryAtRef.current = Date.now() + RETRY_AFTER_FATAL_MS;
          startHlsRef.current(segId, true);
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
        return;
      }

      stallStreakRef.current += 1;
      if (stallStreakRef.current >= STALL_RECREATE_CYCLES) {
        // Воспроизведение так и не поехало после recoverMediaError — пересоздаём инстанс.
        stallStreakRef.current = 0;
        retryAtRef.current = Date.now() + 3000;
        startHlsRef.current(segId, true);
      } else if (stallStreakRef.current >= STALL_RECOVER_CYCLES) {
        hls.recoverMediaError();
      }
    }, WATCH_MS);
    return () => clearInterval(timer);
  }, [isLive, openSeg?.id]);

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
    const pos = hls.liveSyncPosition;
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
    const segId = segIdRef.current;
    if (segId) startHls(segId, true);
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
        <span className={styles.topClock}>последний чанк {edgeClock}</span>
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

        {!noSignal && !autoplayBlocked && !loading && emptyWait && (
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
