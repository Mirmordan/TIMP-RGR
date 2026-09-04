import { useRef, useEffect, useState } from 'react';
import Hls from 'hls.js';
import styles from './VideoPlayer.module.css';

interface VideoPlayerProps {
  src: string;
  autoPlay?: boolean;
}

export function VideoPlayer({ src, autoPlay = false }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        backBufferLength: 90,
        maxMaxBufferLength: 600,
        startFragPrefetch: true,
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        if (autoPlay) video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError('Ошибка загрузки видео');
          setLoading(false);
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari: нативная поддержка HLS
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        setLoading(false);
        if (autoPlay) video.play().catch(() => {});
      });
      video.addEventListener('error', () => {
        setError('Ошибка загрузки видео');
        setLoading(false);
      });
    } else {
      setError('HLS не поддерживается в этом браузере');
      setLoading(false);
    }

    return () => {
      hls?.destroy();
    };
  }, [src, autoPlay]);

  return (
    <div className={styles.wrapper}>
      {loading && <div className={styles.loading}>Загрузка видео...</div>}
      {error && <div className={styles.error}>{error}</div>}
      <video
        ref={videoRef}
        className={styles.video}
        controls
        playsInline
      />
    </div>
  );
}
