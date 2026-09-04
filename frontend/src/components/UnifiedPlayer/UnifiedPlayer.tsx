import { useRef, useEffect, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Timeline } from '../Timeline/Timeline';
import { Button } from '../Button/Button';
import styles from './UnifiedPlayer.module.css';

interface Segment {
  id: string;
  startOffsetS: number;
  durationS: number;
  live?: boolean;
}

interface TimelineData {
  segments: Segment[];
  totalDurationS: number;
  start: string | null;
  end: string | null;
  live?: boolean;
}

interface UnifiedPlayerProps {
  playlistUrl: string;
  liveUrl: string;
  timeline: TimelineData;
}

export function UnifiedPlayer({ playlistUrl, liveUrl, timeline }: UnifiedPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [bufferedRanges, setBufferedRanges] = useState<[number, number][]>([]);

  // duration ВСЕГДА из timeline, НЕ из video.duration
  const totalDuration = timeline.totalDurationS;

  const initHls = useCallback((url: string, live: boolean) => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setLoading(true);
    setError('');

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: live,
        maxBufferLength: live ? 4 : 30,
        maxMaxBufferLength: live ? 8 : 600,
        backBufferLength: live ? 0 : 90,
        liveDurationInfinity: live,
        startFragPrefetch: true,
      });

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        if (live) video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          setError(live ? 'Прямая трансляция недоступна' : 'Ошибка загрузки записи');
          setLoading(false);
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.onloadedmetadata = () => setLoading(false);
    } else {
      setError('HLS не поддерживается');
      setLoading(false);
    }
  }, []);

  // Загружаем HLS когда playlistUrl меняется
  useEffect(() => {
    if (!playlistUrl) return;
    initHls(playlistUrl, false);
    setIsLive(false);
    return () => { hlsRef.current?.destroy(); };
  }, [playlistUrl, initHls]);

  // RAF-цикл для currentTime и buffered
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf: number;
    function tick() {
      setCurrentTime(v.currentTime);
      const ranges: [number, number][] = [];
      for (let i = 0; i < v.buffered.length; i++) {
        ranges.push([v.buffered.start(i), v.buffered.end(i)]);
      }
      setBufferedRanges(ranges);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  }

  // Seek — ставим currentTime, HLS.js подхватит сам
  function handleSeek(timeS: number) {
    const v = videoRef.current;
    if (!v || isLive) return;
    v.currentTime = timeS;
  }

  function goLive() {
    initHls(liveUrl, true);
    setIsLive(true);
  }

  function goRecord() {
    const pos = videoRef.current?.currentTime ?? 0;
    initHls(playlistUrl, false);
    setIsLive(false);
    // Восстанавливаем позицию после загрузки метаданных
    const video = videoRef.current;
    if (video && pos > 0) {
      const trySet = () => {
        if (video.readyState >= 1) video.currentTime = pos;
        else video.addEventListener('loadedmetadata', () => { video.currentTime = pos; }, { once: true });
      };
      trySet();
    }
  }

  function toggleFullscreen() {
    const el = videoRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen();
  }

  const hasLiveSegment = timeline.segments.some(s => s.live);
  const hasAnyData = totalDuration > 0;

  return (
    <div className={styles.player}>
      <div className={styles.videoWrap}>
        {loading && <div className={styles.loading}>Загрузка...</div>}
        {error && <div className={styles.error}>{error}</div>}
        <video ref={videoRef} className={styles.video} controls playsInline onClick={togglePlay} />
      </div>
      <div className={styles.controls}>
        <button className={styles.ctrlBtn} onClick={togglePlay}>
          {playing ? '⏸' : '▶'}
        </button>
        {hasAnyData ? (
          <Timeline
            segments={timeline.segments}
            totalDurationS={totalDuration}
            currentTimeS={isLive ? totalDuration : currentTime}
            bufferedRanges={bufferedRanges}
            onSeek={handleSeek}
          />
        ) : (
          <div className={styles.noTimeline}>Нет данных для воспроизведения</div>
        )}
        <div className={styles.rightControls}>
          {timeline.live && (
            <Button
              variant={isLive ? 'danger' : 'outline'}
              size="sm"
              onClick={isLive ? goRecord : goLive}
            >
              {isLive ? 'Запись' : 'Live'}
            </Button>
          )}
          {hasLiveSegment && !isLive && <span className={styles.liveBadge}>LIVE</span>}
          <button className={styles.ctrlBtn} onClick={toggleFullscreen}>⛶</button>
        </div>
      </div>
    </div>
  );
}
