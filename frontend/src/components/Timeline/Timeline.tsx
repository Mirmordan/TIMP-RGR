import { useRef, useCallback, useState, useMemo } from 'react';
import styles from './Timeline.module.css';

interface Segment {
  id: string;
  startOffsetS: number;
  durationS: number;
  live?: boolean;
}

interface TimelineProps {
  segments: Segment[];
  totalDurationS: number;
  currentTimeS: number;
  bufferedRanges: [number, number][];
  onSeek: (timeS: number) => void;
}

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function segmentBufferFraction(
  segStart: number,
  segDur: number,
  ranges: [number, number][],
): number {
  if (segDur <= 0) return 0;
  const segEnd = segStart + segDur;
  let buffered = 0;
  for (const [rStart, rEnd] of ranges) {
    const overlapStart = Math.max(segStart, rStart);
    const overlapEnd = Math.min(segEnd, rEnd);
    if (overlapEnd > overlapStart) buffered += overlapEnd - overlapStart;
  }
  return Math.min(1, buffered / segDur);
}

export function Timeline({ segments, totalDurationS, currentTimeS, bufferedRanges, onSeek }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  const getTimeFromClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || totalDurationS <= 0) return 0;
    const x = e.clientX - rect.left;
    return Math.max(0, Math.min(totalDurationS, (x / rect.width) * totalDurationS));
  }, [totalDurationS]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    onSeek(getTimeFromClick(e));
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || totalDurationS <= 0) return;
    const x = e.clientX - rect.left;
    setHoverX(x);
    setHoverTime(Math.max(0, Math.min(totalDurationS, (x / rect.width) * totalDurationS)));
  }

  function handleMouseLeave() {
    setHoverX(null);
    setHoverTime(null);
  }

  const progressPct = totalDurationS > 0 ? (currentTimeS / totalDurationS) * 100 : 0;

  const segmentBuffers = useMemo(() =>
    segments.map(seg => ({
      ...seg,
      bufferPct: segmentBufferFraction(seg.startOffsetS, seg.durationS, bufferedRanges) * 100,
    })),
    [segments, bufferedRanges],
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.timeDisplay}>
        <span>{formatTime(currentTimeS)}</span>
        <span className={styles.timeSep}>/</span>
        <span>{formatTime(totalDurationS)}</span>
      </div>
      <div
        className={styles.track}
        ref={trackRef}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className={styles.progress} style={{ width: `${progressPct}%` }} />
        {segmentBuffers.map(seg => {
          const left = totalDurationS > 0 ? (seg.startOffsetS / totalDurationS) * 100 : 0;
          const width = totalDurationS > 0 ? (seg.durationS / totalDurationS) * 100 : 0;
          const cls = seg.live ? `${styles.segment} ${styles.live}` : styles.segment;
          return (
            <div key={seg.id} className={styles.segmentWrap} style={{ left: `${left}%`, width: `${Math.min(100, width)}%` }}>
              <div
                className={`${styles.segmentBuffer} ${seg.live ? styles.liveBuffer : ''}`}
                style={{ width: `${seg.bufferPct}%` }}
              />
              <div
                className={cls}
                title={seg.live
                  ? `LIVE — ${formatTime(seg.startOffsetS)}`
                  : `${formatTime(seg.startOffsetS)} — ${formatTime(seg.startOffsetS + seg.durationS)} (${Math.round(seg.bufferPct)}%)`}
              />
            </div>
          );
        })}
        <div className={styles.cursor} style={{ left: `${progressPct}%` }} />
        {hoverX != null && hoverTime != null && (
          <div className={styles.hoverTooltip} style={{ left: hoverX }}>
            {formatTime(hoverTime)}
          </div>
        )}
      </div>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} /> Запись
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.liveDot}`} /> Live
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.bufferDot}`} /> Прогружено
        </span>
      </div>
    </div>
  );
}
