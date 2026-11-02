import { useEffect, useState } from 'react';

import { currentPosition, usePlayer } from '@/stores/player';

/** Smoothly extrapolated playback position (the engine reports twice a second). */
export function usePlaybackPosition(intervalMs = 250): { position: number; duration: number } {
  const isPlaying = usePlayer((s) => s.isPlaying);
  const duration = usePlayer((s) => s.duration);
  const reported = usePlayer((s) => s.position);
  const [position, setPosition] = useState(currentPosition());

  useEffect(() => {
    setPosition(currentPosition());
    if (!isPlaying) return;
    const id = setInterval(() => setPosition(currentPosition()), intervalMs);
    return () => clearInterval(id);
  }, [isPlaying, reported, intervalMs]);

  return { position, duration };
}
