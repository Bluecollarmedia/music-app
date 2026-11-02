import { useSegments } from 'expo-router';

export type TabName = 'listen' | 'library' | 'search';

/** Which tab's stack the current screen lives in, so detail links stay inside that tab. */
export function useTab(): TabName {
  const segments = useSegments() as string[];
  const tab = segments.find((s) => s === 'listen' || s === 'library' || s === 'search');
  return (tab as TabName) ?? 'library';
}

export function useHrefs() {
  const tab = useTab();
  return {
    album: (id: string) => `/${tab}/album/${id}` as const,
    artist: (id: string) => `/${tab}/artist/${id}` as const,
    playlist: (id: string) => `/${tab}/playlist/${id}` as const,
  };
}
