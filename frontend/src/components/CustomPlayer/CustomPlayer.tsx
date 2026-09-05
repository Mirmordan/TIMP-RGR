import { useRef, useEffect, useState, useMemo } from 'react';
import Hls from 'hls.js';
import { Button } from '../Button/Button';
import styles from './CustomPlayer.module.css';
import type { RecordingIncident as Incident, TimelineData, TimelineSegment as Segment } from '../../types';

interface CustomPlayerProps {
  processId: string;
  liveUrl: string;
  timeline: TimelineData;
  incidents?: Incident[];
  onCreateIncident?: (data: { title: string; description?: string; timeOffsetS: number; severity: string }) => Promise<Incident>;
  onUpdateIncident?: (id: string, data: { title: string; description?: string; severity: string }) => Promise<void>;
  onDeleteIncident?: (id: string) => Promise<void>;
}

export function CustomPlayer({
  liveUrl,
  timeline,
  incidents = [],
  onCreateIncident,
  onUpdateIncident,
  onDeleteIncident,
}: CustomPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const totalDuration = timeline.totalDurationS || 1;
  const hasAnyData = timeline.totalDurationS > 0;

  const recordedSegments = useMemo(
    () =>
      timeline.segments
        .filter((s) => !s.live)
        .sort((a, b) => a.startOffsetS - b.startOffsetS),
    [timeline.segments]
  );

  const liveSegment = useMemo(() => timeline.segments.find((s) => s.live), [timeline.segments]);

  // --- Core state ---
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [timelineTime, setTimelineTime] = useState(0);
  const [gapMode, setGapMode] = useState(false);

  // Refs for non-reactive access in callbacks/RAF
  const timelineTimeRef = useRef(0);
  const gapModeRef = useRef(false);
  const playingRef = useRef(false);
  const loadedSegRef = useRef<Segment | null>(null);
  const windowAnchorRef = useRef(0);
  const gapTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveRef = useRef(false);

  // Hover-preview state: scrub within the loaded window while hovering the track.
  const hoverPreviewRef = useRef(false);
  const hoverPendingTLRef = useRef<number | null>(null);
  const hoverLastPreviewTLRef = useRef(-Infinity);
  const hoverWasPlayingRef = useRef(false);
  const hoverResumeTLRef = useRef(0);
  const hoverTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Incident modals ---
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentDesc, setIncidentDesc] = useState('');
  const [incidentSeverity, setIncidentSeverity] = useState<'info' | 'warning' | 'critical'>('warning');
  const [incidentSaving, setIncidentSaving] = useState(false);

  const [editIncident, setEditIncident] = useState<Incident | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editSeverity, setEditSeverity] = useState<'info' | 'warning' | 'critical'>('info');
  const [editSaving, setEditSaving] = useState(false);

  // --- Sidebar ---
  const [timecodesTab, setTimecodesTab] = useState<'segments' | 'incidents'>('segments');

  // --- Time input ---
  const [timeInputValue, setTimeInputValue] = useState('');
  const [timeInputEditing, setTimeInputEditing] = useState(false);

  // --- Track interaction ---
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const lastMouseXRef = useRef(0);
  const dragRef = useRef(false);

  // --- Helpers ---
  function setTL(t: number) {
    timelineTimeRef.current = t;
    setTimelineTime(t);
  }
  function setGap(g: boolean) {
    gapModeRef.current = g;
    setGapMode(g);
  }
  function setPlayingState(p: boolean) {
    playingRef.current = p;
    setPlaying(p);
  }
  function setLiveState(l: boolean) {
    liveRef.current = l;
    setIsLive(l);
  }

  function findSegmentAt(t: number): Segment | null {
    for (const seg of recordedSegments) {
      if (t >= seg.startOffsetS && t < seg.startOffsetS + seg.durationS) return seg;
    }
    return null;
  }

  function isAdjacent(a: Segment, b: Segment): boolean {
    const aEnd = a.startOffsetS + a.durationS;
    return Math.abs(aEnd - b.startOffsetS) < 1;
  }

  function findNextSeg(seg: Segment): Segment | null {
    const idx = recordedSegments.indexOf(seg);
    if (idx < 0 || idx >= recordedSegments.length - 1) return null;
    return recordedSegments[idx + 1]!;
  }

  // --- Destroy HLS ---
  function destroyHls() {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }

  // --- Stop gap timer ---
  function stopGap() {
    if (gapTimerRef.current) {
      clearInterval(gapTimerRef.current);
      gapTimerRef.current = null;
    }
  }

  // --- Hover preview: scrub within the loaded window while hovering the track ---
  function stopHoverTimer() {
    if (hoverTimerRef.current) {
      clearInterval(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }

  function resetHoverSession() {
    stopHoverTimer();
    hoverPendingTLRef.current = null;
    hoverPreviewRef.current = false;
    hoverLastPreviewTLRef.current = -Infinity;
    hoverWasPlayingRef.current = false;
  }

  function endHoverPreview() {
    const wasPreview = hoverPreviewRef.current;
    const v = videoRef.current;
    const seg = loadedSegRef.current;
    if (wasPreview && v && seg && !gapModeRef.current && !liveRef.current && !v.ended) {
      const media = hoverResumeTLRef.current - (seg.startOffsetS + windowAnchorRef.current);
      const dur = Number.isFinite(v.duration) ? v.duration : 0;
      v.currentTime = Math.max(0, Math.min(media, dur));
      if (hoverWasPlayingRef.current) {
        v.play().then(() => setPlayingState(true)).catch(() => {});
      }
    }
    resetHoverSession();
  }

  // Perform a scrub seek (anti-lag: only when the pointer rested >=300ms on a position
  // that moved >=1.5s from the last applied preview frame).
  function applyHoverPreview() {
    const v = videoRef.current;
    const seg = loadedSegRef.current;
    const pending = hoverPendingTLRef.current;
    if (!v || !seg || pending === null) return;
    if (gapModeRef.current || liveRef.current || dragRef.current) return;
    // Dirty states (buffering/seek in flight): don't jump.
    if (v.seeking || v.readyState < 2) return;
    const media = pending - (seg.startOffsetS + windowAnchorRef.current);
    const dur = v.duration;
    // Only scrub within the loaded window; other segments / gaps → no seek.
    if (!Number.isFinite(dur) || !(media >= 0.5 && media <= dur - 0.5)) return;
    if (hoverPreviewRef.current && Math.abs(pending - hoverLastPreviewTLRef.current) < 1.5) return;

    if (!hoverPreviewRef.current) {
      hoverPreviewRef.current = true;
      hoverWasPlayingRef.current = !v.paused && !v.ended;
      hoverResumeTLRef.current = timelineTimeRef.current;
      if (hoverWasPlayingRef.current) v.pause();
    }
    hoverLastPreviewTLRef.current = pending;
    v.currentTime = media + 0.05;
  }

  function startHoverTimer() {
    if (hoverTimerRef.current) return;
    hoverTimerRef.current = setInterval(() => {
      if (dragRef.current || gapModeRef.current || liveRef.current) {
        endHoverPreview();
        return;
      }
      if (hoverPendingTLRef.current === null) return;
      applyHoverPreview();
    }, 300);
  }

  // --- Enter gap mode ---
  function enterGap(atTime: number, autoPlay = false) {
    const v = videoRef.current;
    destroyHls();
    stopGap();
    loadedSegRef.current = null;
    if (v) {
      v.pause();
      v.removeAttribute('src');
      v.load();
    }
    setGap(true);
    setTL(atTime);
    setPlayingState(false);
    setLoading(false);
    setError('');
    if (autoPlay) startGapPlayback(atTime);
  }

  // --- Gap playback (timer advancing cursor) ---
  function startGapPlayback(fromTime: number) {
    stopGap(); // FIX: ensure previous timer is cleared
    setGap(true);
    setPlayingState(true);
    let t = fromTime;
    gapTimerRef.current = setInterval(() => {
      t += 0.25;
      if (t >= totalDuration) {
        t = totalDuration;
        stopGap();
        setPlayingState(false);
        setTL(t);
        return;
      }
      const seg = findSegmentAt(t);
      if (seg && seg.fileCount > 0) {
        stopGap();
        loadSegment(seg, t, true);
        return;
      }
      setTL(t);
    }, 250);
  }

  // --- Load a single segment via an HLS window playlist (?start=offset) ---
  function loadSegment(seg: Segment, atTimelineTime?: number, autoPlay = true) {
    const v = videoRef.current;
    if (!v) return;

    destroyHls();
    stopGap();
    setGap(false);
    setError('');
    setLoading(true);
    setPlayingState(false);

    loadedSegRef.current = seg;

    const withinSeg = atTimelineTime != null ? Math.max(0, atTimelineTime - seg.startOffsetS) : 0;
    const targetTL = atTimelineTime != null ? atTimelineTime : seg.startOffsetS;
    setTL(targetTL);

    // Окно плейлиста: стартуем с начала чанка, накрывающего нужный момент сегмента.
    const windowStartS = Math.floor(withinSeg);
    windowAnchorRef.current = windowStartS;
    const targetInWindow = withinSeg - windowStartS;
    const url = `/api/v1/segments/${seg.id}/playlist?start=${windowStartS}`;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 90,
      });
      hls.loadSource(url);
      hls.attachMedia(v);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        if (targetInWindow > 0.5) {
          v.currentTime = targetInWindow;
        }
        if (autoPlay) {
          v.play().then(() => setPlayingState(true)).catch(() => {});
        }
      });

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad(0);
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else if (!hoverPreviewRef.current) {
          // During hover-preview scrub errors must not surface a toast/overlay.
          setError('Не удалось загрузить сегмент');
          setLoading(false);
          setPlayingState(false);
        }
      });

      hlsRef.current = hls;
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari fallback: нативный HLS с тем же оконным плейлистом
      const onLoadedMetadata = () => {
        v.removeEventListener('loadedmetadata', onLoadedMetadata);
        v.removeEventListener('error', onError);
        setLoading(false);
        if (targetInWindow > 0.5) v.currentTime = targetInWindow;
        if (autoPlay) {
          v.play().then(() => setPlayingState(true)).catch(() => {});
        }
      };
      const onError = () => {
        v.removeEventListener('loadedmetadata', onLoadedMetadata);
        v.removeEventListener('error', onError);
        setLoading(false);
        setError('Не удалось загрузить сегмент');
        setPlayingState(false);
      };
      v.addEventListener('loadedmetadata', onLoadedMetadata);
      v.addEventListener('error', onError);
      v.src = url;
      v.load();
    } else {
      setError('HLS не поддерживается');
      setLoading(false);
    }
  }

  // --- Handle segment ended ---
  function handleSegmentEnded() {
    const v = videoRef.current;
    const cur = loadedSegRef.current;
    if (!cur) return;

    v?.pause();
    setPlayingState(false);

    const next = findNextSeg(cur);
    // FIX: check that next has fileCount > 0
    if (next && next.fileCount > 0 && isAdjacent(cur, next)) {
      loadSegment(next, next.startOffsetS, true);
    } else {
      const gapStart = cur.startOffsetS + cur.durationS;
      enterGap(gapStart, false);
    }
  }

  // --- Seek ---
  function seekTo(t: number, autoPlay?: boolean) {
    const v = videoRef.current;
    if (!v) return;
    // A real seek exits any hover-preview session so the RAF sync never stays frozen.
    endHoverPreview();
    const target = Math.max(0, Math.min(t, totalDuration));

    stopGap();
    setDragTime(null);

    // FIX: reset loadedSeg when going to live
    if (liveSegment && target >= liveSegment.startOffsetS) {
      loadedSegRef.current = null;
      setGap(false);
      setLiveState(true);
      initLiveHls();
      return;
    }

    setLiveState(false);
    const seg = findSegmentAt(target);
    if (!seg || seg.fileCount === 0) {
      enterGap(target, false);
      return;
    }

    const shouldPlay = autoPlay ?? !v.paused;
    loadSegment(seg, target, shouldPlay);
  }

  // --- HLS live ---
  function initLiveHls() {
    const video = videoRef.current;
    if (!video) return;

    // Если есть открытый DB-сегмент — живьём играем его EVENT-плейлист
    // (без ENDLIST → hls.js live-режим, подхватывает дописанные .ts).
    // liveUrl (mediaMTX HLS) остаётся запасным путём, когда открытого сегмента нет.
    const backendLive = !!liveSegment;
    const src = backendLive ? `/api/v1/segments/${liveSegment.id}/playlist` : liveUrl;
    if (!src) {
      setError('Прямая трансляция недоступна');
      return;
    }

    destroyHls();
    stopGap();
    setGap(false);
    setLoading(true);
    setError('');
    setPlayingState(false);
    if (backendLive) {
      loadedSegRef.current = liveSegment;
      windowAnchorRef.current = 0;
    } else {
      loadedSegRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        autoStartLoad: false,
        maxBufferLength: 4,
        maxMaxBufferLength: 8,
        liveDurationInfinity: true,
        startLevel: -1,
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        video.play().then(() => setPlayingState(true)).catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad(0);
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          setError('Прямая трансляция недоступна');
          setLoading(false);
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.play().then(() => setPlayingState(true)).catch(() => {});
      setLoading(false);
    } else {
      setError('HLS не поддерживается');
      setLoading(false);
    }
  }

  // --- Init: auto-start live if needed ---
  useEffect(() => {
    if (timeline.live && recordedSegments.length === 0) {
      initLiveHls();
      setLiveState(true);
    }
    return () => {
      destroyHls();
    };
  }, [timeline.live, liveUrl, recordedSegments]);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      stopGap();
      stopHoverTimer();
      destroyHls();
      // FIX: remove any lingering pointer listeners
      if (dragRef.current) {
        window.removeEventListener('pointermove', () => {});
        window.removeEventListener('pointerup', () => {});
        window.removeEventListener('pointercancel', () => {});
        dragRef.current = false;
      }
    };
  }, []);

  // --- RAF: sync timelineTime from video ---
  useEffect(() => {
    if (!videoRef.current) return;
    let raf: number;

    const tick = () => {
      const v = videoRef.current;
      const curSeg = loadedSegRef.current;
      // During hover-preview the video is paused/scrubbed by the pointer;
      // skip tl/playing sync so the cursor and play state don't fight the preview.
      if (!hoverPreviewRef.current && curSeg && v && !gapTimerRef.current) {
        const pt = v.currentTime;
        const tl = curSeg.startOffsetS + windowAnchorRef.current + pt;

        if (Math.abs(timelineTimeRef.current - tl) > 0.1) {
          timelineTimeRef.current = tl;
          setTimelineTime(tl);
        }

        const realPlaying = !v.paused && !v.ended;
        if (realPlaying !== playingRef.current) {
          setPlayingState(realPlaying);
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // --- Video events ---
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    function onEnded() {
      handleSegmentEnded();
    }

    v.addEventListener('ended', onEnded);
    return () => v.removeEventListener('ended', onEnded);
  }, []);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (showIncidentModal) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 60 : 10;
        seekTo(Math.max(0, timelineTimeRef.current - step), false);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 60 : 10;
        seekTo(Math.min(totalDuration, timelineTimeRef.current + step), false);
      } else if (e.code === 'KeyF') {
        toggleFullscreen();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showIncidentModal, totalDuration]);

  // --- Controls ---
  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    // A manual play/pause press leaves any active hover-preview session.
    endHoverPreview();

    // In gap mode: start/stop gap playback
    if (gapModeRef.current) {
      if (gapTimerRef.current) {
        stopGap();
        setPlayingState(false);
      } else {
        startGapPlayback(timelineTimeRef.current);
      }
      return;
    }

    // No segment loaded and not live: find segment at current time and load it
    if (!loadedSegRef.current && !isLive) {
      // FIX: check if there are any recorded segments
      if (recordedSegments.length === 0) return;
      const segAtTime = findSegmentAt(timelineTimeRef.current);
      const target =
        segAtTime && segAtTime.fileCount > 0
          ? segAtTime
          : recordedSegments.find((s) => s.fileCount > 0) ?? recordedSegments[0];
      if (!target) return;
      loadSegment(target, timelineTimeRef.current, true);
      return;
    }

    // Live mode, no segment: start live HLS
    if (!loadedSegRef.current && isLive) {
      initLiveHls();
      return;
    }

    // Segment loaded: toggle video play/pause
    if (v.paused) {
      v.play().then(() => setPlayingState(true)).catch(() => {});
    } else {
      v.pause();
      setPlayingState(false);
    }
  }

  function toggleFullscreen() {
    const el = videoRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen();
  }

  function goLive() {
    // FIX: check existence of live segment
    if (!liveSegment) {
      setError('Прямая трансляция недоступна');
      return;
    }
    setLiveState(true);
    setGap(false);
    loadedSegRef.current = null;
    initLiveHls();
  }

  function goRecord() {
    setLiveState(false);
    setGap(false);
    if (recordedSegments.length > 0) {
      loadSegment(recordedSegments[0]!, recordedSegments[0]!.startOffsetS, false);
    }
  }

  // --- Incident handlers ---
  async function saveIncident() {
    if (!onCreateIncident || !incidentTitle.trim()) return;
    setIncidentSaving(true);
    try {
      await onCreateIncident({
        title: incidentTitle.trim(),
        description: incidentDesc.trim() || undefined,
        timeOffsetS: timelineTimeRef.current,
        severity: incidentSeverity,
      });
      setShowIncidentModal(false);
      setIncidentTitle('');
      setIncidentDesc('');
      setTimecodesTab('incidents');
    } catch (err) {
      console.error('Failed to create incident:', err);
      // Optionally set an error state
    } finally {
      setIncidentSaving(false);
    }
  }

  async function saveEditIncident() {
    if (!onUpdateIncident || !editIncident || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      await onUpdateIncident(editIncident.id, {
        title: editTitle.trim(),
        description: editDesc.trim() || undefined,
        severity: editSeverity,
      });
      setEditIncident(null);
    } catch (err) {
      console.error('Failed to update incident:', err);
    } finally {
      setEditSaving(false);
    }
  }

  // --- Time formatting ---
  function formatTime(s: number): string {
    if (!isFinite(s) || isNaN(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function toAbsoluteDate(relativeS: number): Date | null {
    if (!timeline.start) return null;
    const startDate = new Date(timeline.start);
    if (isNaN(startDate.getTime())) return null;
    return new Date(startDate.getTime() + relativeS * 1000);
  }

  function formatAbsoluteClock(relativeS: number): string {
    const d = toAbsoluteDate(relativeS);
    if (!d) return formatTime(relativeS);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }

  function formatAbsoluteDate(relativeS: number): string {
    const d = toAbsoluteDate(relativeS);
    if (!d) return '';
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  }

  function formatAbsoluteTime(relativeS: number): string {
    return `${formatAbsoluteDate(relativeS)} ${formatAbsoluteClock(relativeS)}`;
  }

  function formatSize(bytes: number | string): string {
    const b = Number(bytes);
    if (b < 1024) return `${b} Б`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} КБ`;
    return `${(b / (1024 * 1024)).toFixed(1)} МБ`;
  }

  function parseTimeInput(input: string): number | null {
    const trimmed = input.trim();

    // FIX: improved date parsing with validation
    let m = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
    if (m) {
      const [, dd, mm, yyyy, hh, mi, ss] = m;
      if (!timeline.start) return null;
      const startDate = new Date(timeline.start);
      if (isNaN(startDate.getTime())) return null;
      const target = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi, +ss));
      return (target.getTime() - startDate.getTime()) / 1000;
    }

    m = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
    if (m) {
      const [, dd, mm, yyyy, hh, mi] = m;
      if (!timeline.start) return null;
      const startDate = new Date(timeline.start);
      if (isNaN(startDate.getTime())) return null;
      const target = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi, 0));
      return (target.getTime() - startDate.getTime()) / 1000;
    }

    m = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (m) {
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const s = parseInt(m[3], 10);
      if (h > 23 || min > 59 || s > 59) return null;
      if (!timeline.start) return null;
      const startDate = new Date(timeline.start);
      if (isNaN(startDate.getTime())) return null;
      return (h * 3600 + min * 60 + s) - startDate.getTime() / 1000;
    }

    m = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      if (h > 23 || min > 59) return null;
      if (!timeline.start) return null;
      const startDate = new Date(timeline.start);
      if (isNaN(startDate.getTime())) return null;
      return (h * 3600 + min * 60) - startDate.getTime() / 1000;
    }

    const num = parseFloat(trimmed);
    if (!isNaN(num) && num >= 0) return num;
    return null;
  }

  function handleTimeInputSubmit() {
    const t = parseTimeInput(timeInputValue);
    if (t !== null) seekTo(Math.max(0, Math.min(t, totalDuration)));
    setTimeInputEditing(false);
  }

  // --- Track interaction ---
  function getTimeFromX(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const x = clientX - rect.left;
    return Math.max(0, Math.min(totalDuration, (x / rect.width) * totalDuration));
  }

  function handleTrackPointerDown(e: React.PointerEvent) {
    // A press ends any active hover-preview session (restore + resume) before drag/seek takes over.
    endHoverPreview();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = true;
    lastMouseXRef.current = e.clientX;
    setDragTime(getTimeFromX(e.clientX));

    function onMove(ev: PointerEvent) {
      if (!dragRef.current) return;
      lastMouseXRef.current = ev.clientX;
      setDragTime(getTimeFromX(ev.clientX));
    }
    function onUp() {
      const finalTime = getTimeFromX(lastMouseXRef.current);
      dragRef.current = false;
      setDragTime(null);
      seekTo(finalTime);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function handleTrackPointerMove(e: React.PointerEvent) {
    if (dragRef.current) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    setHoverX(x);
    const t = getTimeFromX(e.clientX);
    setHoverTime(t);
    // Remember the latest hovered timeline position; a 300ms timer performs the
    // actual scrub (anti-lag), so micro mouse jitter does not seek every tick.
    hoverPendingTLRef.current = t;
    if (!hoverTimerRef.current && !gapModeRef.current && !liveRef.current && loadedSegRef.current) {
      startHoverTimer();
    }
  }

  function handleTrackPointerLeave() {
    if (dragRef.current) return;
    setHoverX(null);
    setHoverTime(null);
    endHoverPreview();
  }

  // --- Computed ---
  const displayTime = dragTime ?? timelineTime;
  const progressPct = totalDuration > 0 ? (displayTime / totalDuration) * 100 : 0;

  const hourMarkers = useMemo(() => {
    const markers: { time: number; clock: string; date: string }[] = [];
    if (timeline.totalDurationS <= 0) return markers;
    const count = 6;
    for (let i = 0; i < count; i++) {
      const t = (timeline.totalDurationS * i) / (count - 1);
      markers.push({ time: t, clock: formatAbsoluteClock(t), date: formatAbsoluteDate(t) });
    }
    return markers;
  }, [timeline.totalDurationS, timeline.start]);

  const incidentCount = incidents.length;
  const segmentCount = recordedSegments.length;
  const showGapOverlay = gapMode && !loading && !error;

  return (
    <div className={styles.player}>
      <div className={styles.playerLayout}>
        <div className={styles.playerMain}>
          <div className={styles.videoWrap}>
            {loading && <div className={styles.overlay}>Загрузка...</div>}
            {showGapOverlay && <div className={`${styles.overlay} ${styles.gapOverlay}`}>Запись отсутствует</div>}
            {error && <div className={`${styles.overlay} ${styles.errorOverlay}`}>{error}</div>}
            <video ref={videoRef} className={styles.video} playsInline onClick={togglePlay} />
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

            {timeInputEditing ? (
              <input
                className={styles.timeInput}
                value={timeInputValue}
                onChange={(e) => setTimeInputValue(e.target.value)}
                onBlur={handleTimeInputSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTimeInputSubmit();
                  else if (e.key === 'Escape') setTimeInputEditing(false);
                }}
                autoFocus
                placeholder="DD.MM.YYYY HH:MM:SS"
              />
            ) : (
              <div
                className={styles.time}
                onClick={() => {
                  setTimeInputEditing(true);
                  setTimeInputValue(formatAbsoluteTime(displayTime));
                }}
                title="Нажмите чтобы ввести время"
              >
                {formatAbsoluteTime(displayTime)}
              </div>
            )}

            {hasAnyData && (
              <div className={styles.rightBtns}>
                {timeline.live && (
                  <Button
                    variant={isLive ? 'danger' : 'outline'}
                    size="sm"
                    onClick={isLive ? goRecord : goLive}
                  >
                    {isLive ? 'Запись' : 'Live'}
                  </Button>
                )}
                {liveSegment && !isLive && <span className={styles.liveBadge}>LIVE</span>}
                {onCreateIncident && (
                  <button className={styles.btn} onClick={() => setShowIncidentModal(true)} title="Создать инцидент">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </button>
                )}
                <button className={styles.btn} onClick={toggleFullscreen} title="Полный экран">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {hasAnyData && (
            <div className={styles.timelineArea}>
              <div
                className={styles.trackWrap}
                ref={trackRef}
                onPointerDown={handleTrackPointerDown}
                onPointerMove={handleTrackPointerMove}
                onPointerLeave={handleTrackPointerLeave}
              >
                <div className={styles.track}>
                  {hourMarkers.map((m) => {
                    const left = (m.time / totalDuration) * 100;
                    return (
                      <div key={m.time} className={styles.hourMarker} style={{ left: `${left}%` }}>
                        <div className={styles.hourMarkerLine} />
                        <span className={styles.hourMarkerLabel}>
                          <span>{m.clock}</span>
                          <span>{m.date}</span>
                        </span>
                      </div>
                    );
                  })}

                  {recordedSegments.map((seg) => {
                    const left = (seg.startOffsetS / totalDuration) * 100;
                    const width = (seg.durationS / totalDuration) * 100;
                    return (
                      <div
                        key={seg.id}
                        className={styles.segMarker}
                        style={{ left: `${left}%`, width: `${Math.min(100, width)}%` }}
                      />
                    );
                  })}

                  {liveSegment &&
                    (() => {
                      const left = (liveSegment.startOffsetS / totalDuration) * 100;
                      const width = (liveSegment.durationS / totalDuration) * 100;
                      return (
                        <div
                          key={liveSegment.id}
                          className={`${styles.segMarker} ${styles.segMarkerLive}`}
                          style={{ left: `${left}%`, width: `${Math.min(100, width)}%` }}
                        />
                      );
                    })()}

                  {incidents.map((inc) => {
                    const left = (inc.timeOffsetS / totalDuration) * 100;
                    const color =
                      inc.severity === 'critical' ? '#ef4444' : inc.severity === 'warning' ? '#eab308' : '#3b82f6';
                    return (
                      <div
                        key={inc.id}
                        className={styles.incidentMarker}
                        style={{ left: `${left}%` }}
                        title={`${inc.title}${inc.description ? ': ' + inc.description : ''}`}
                      >
                        <div className={styles.incidentDot} style={{ background: color }} />
                      </div>
                    );
                  })}

                  <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
                </div>

                <div className={styles.cursorLine} style={{ left: `${progressPct}%` }}>
                  <div className={styles.cursorHandle} />
                </div>

                {hoverX != null && hoverTime != null && !dragRef.current && (
                  <div className={styles.tooltip} style={{ left: hoverX }}>
                    <div>{formatAbsoluteClock(hoverTime)}</div>
                    <div>{formatAbsoluteDate(hoverTime)}</div>
                  </div>
                )}

                {dragTime != null && (
                  <div className={styles.tooltip} style={{ left: `${progressPct}%` }}>
                    <div>{formatAbsoluteClock(dragTime)}</div>
                    <div>{formatAbsoluteDate(dragTime)}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!hasAnyData && <div className={styles.noData}>Нет данных</div>}
        </div>

        <div className={styles.sidebar}>
          <div className={styles.sidebarTabs}>
            <button
              className={`${styles.sidebarTab} ${timecodesTab === 'segments' ? styles.sidebarTabActive : ''}`}
              onClick={() => setTimecodesTab('segments')}
            >
              Сегменты <span className={styles.tabBadge}>{segmentCount}</span>
            </button>
            <button
              className={`${styles.sidebarTab} ${timecodesTab === 'incidents' ? styles.sidebarTabActive : ''}`}
              onClick={() => setTimecodesTab('incidents')}
            >
              Инциденты <span className={styles.tabBadge}>{incidentCount}</span>
            </button>
          </div>

          <div className={styles.sidebarContent}>
            {timecodesTab === 'segments' && (
              <div className={styles.timecodesList}>
                {recordedSegments.length === 0 && <div className={styles.timecodesEmpty}>Нет сегментов</div>}
                {recordedSegments.map((seg, i) => {
                  const isActive = !isLive && !gapMode && loadedSegRef.current?.id === seg.id;
                  return (
                    <div
                      key={seg.id}
                      className={`${styles.timecodesItem} ${isActive ? styles.timecodesItemActive : ''}`}
                      onClick={() => seekTo(seg.startOffsetS)}
                    >
                      <span className={styles.timecodesIndex}>{i + 1}</span>
                      <div className={styles.timecodesInfo}>
                        <div className={styles.timecodesTime}>{formatAbsoluteTime(seg.startOffsetS)}</div>
                        <div className={styles.timecodesMeta}>
                          {formatTime(seg.durationS)} · {seg.fileCount}ф · {formatSize(seg.sizeBytes)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {liveSegment && (
                  <div
                    className={`${styles.timecodesItem} ${styles.timecodesItemLive}`}
                    onClick={() => seekTo(liveSegment.startOffsetS)}
                  >
                    <span className={styles.timecodesIndex}>●</span>
                    <div className={styles.timecodesInfo}>
                      <div className={styles.timecodesTime}>LIVE</div>
                      <div className={styles.timecodesMeta}>Прямая трансляция</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {timecodesTab === 'incidents' && (
              <div className={styles.timecodesList}>
                {incidents.length === 0 && <div className={styles.timecodesEmpty}>Нет инцидентов</div>}
                {incidents.map((inc) => {
                  const sevColor =
                    inc.severity === 'critical' ? '#ef4444' : inc.severity === 'warning' ? '#eab308' : '#3b82f6';
                  return (
                    <div
                      key={inc.id}
                      className={styles.timecodesItem}
                      onClick={() => seekTo(inc.timeOffsetS)}
                    >
                      <span className={styles.timecodesIndex} style={{ color: sevColor }}>●</span>
                      <div className={styles.timecodesInfo}>
                        <div className={styles.timecodesTime}>{inc.title}</div>
                        <div className={styles.timecodesMeta}>
                          {formatAbsoluteTime(inc.timeOffsetS)}
                          {inc.description ? ` · ${inc.description}` : ''}
                        </div>
                      </div>
                      {onDeleteIncident && (
                        <button
                          className={styles.timecodesDel}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditIncident(inc);
                            setEditTitle(inc.title);
                            setEditDesc(inc.description ?? '');
                            setEditSeverity(inc.severity);
                          }}
                          title="Просмотреть"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                            <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {showIncidentModal && (
        <div className={styles.modalOverlay} onClick={() => setShowIncidentModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span>Новый инцидент — {formatAbsoluteTime(displayTime)}</span>
              <button className={styles.btn} onClick={() => setShowIncidentModal(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <label className={styles.modalLabel}>
                Название
                <input
                  className={styles.modalInput}
                  value={incidentTitle}
                  onChange={(e) => setIncidentTitle(e.target.value)}
                  placeholder="Например: Подозрительный объект"
                  autoFocus
                />
              </label>
              <label className={styles.modalLabel}>
                Описание
                <textarea
                  className={styles.modalTextarea}
                  value={incidentDesc}
                  onChange={(e) => setIncidentDesc(e.target.value)}
                  placeholder="Подробности (необязательно)"
                  rows={3}
                />
              </label>
              <label className={styles.modalLabel}>
                Важность
                <div className={styles.modalSeverities}>
                  {(['info', 'warning', 'critical'] as const).map((s) => (
                    <button
                      key={s}
                      className={`${styles.modalSeverityBtn} ${incidentSeverity === s ? styles.modalSeverityActive : ''}`}
                      onClick={() => setIncidentSeverity(s)}
                    >
                      {s === 'info' ? 'Инфо' : s === 'warning' ? 'Внимание' : 'Критично'}
                    </button>
                  ))}
                </div>
              </label>
            </div>
            <div className={styles.modalFooter}>
              <Button variant="outline" size="sm" onClick={() => setShowIncidentModal(false)}>Отмена</Button>
              <Button variant="success" size="sm" onClick={saveIncident} disabled={!incidentTitle.trim() || incidentSaving}>
                {incidentSaving ? '...' : 'Создать'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editIncident && (
        <div className={styles.modalOverlay} onClick={() => setEditIncident(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span>Инцидент — {formatAbsoluteTime(editIncident.timeOffsetS)}</span>
              <button className={styles.btn} onClick={() => setEditIncident(null)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <label className={styles.modalLabel}>
                Название
                <input
                  className={styles.modalInput}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  autoFocus
                />
              </label>
              <label className={styles.modalLabel}>
                Описание
                <textarea
                  className={styles.modalTextarea}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="(необязательно)"
                  rows={3}
                />
              </label>
              <label className={styles.modalLabel}>
                Важность
                <div className={styles.modalSeverities}>
                  {(['info', 'warning', 'critical'] as const).map((s) => (
                    <button
                      key={s}
                      className={`${styles.modalSeverityBtn} ${editSeverity === s ? styles.modalSeverityActive : ''}`}
                      onClick={() => setEditSeverity(s)}
                    >
                      {s === 'info' ? 'Инфо' : s === 'warning' ? 'Внимание' : 'Критично'}
                    </button>
                  ))}
                </div>
              </label>
              {editIncident.createdBy && <div className={styles.modalLabel}>Создал: {editIncident.createdBy}</div>}
            </div>
            <div className={styles.modalFooter}>
              {onDeleteIncident && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    onDeleteIncident(editIncident.id);
                    setEditIncident(null);
                  }}
                >
                  Удалить
                </Button>
              )}
              <div style={{ flex: 1 }} />
              <Button variant="outline" size="sm" onClick={() => setEditIncident(null)}>Отмена</Button>
              <Button variant="success" size="sm" onClick={saveEditIncident} disabled={!editTitle.trim() || editSaving}>
                {editSaving ? '...' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}