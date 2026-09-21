import { useCallback, useRef, useState } from 'react';

export type ActressFilm = { code: string; title: string; date: string };
export type ActressFilmsStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'unavailable';

function parseFilmsResponse(value: unknown): ActressFilm[] | null {
  if (!value || typeof value !== 'object') return null;
  const films = (value as { films?: unknown }).films;
  if (!Array.isArray(films)) return null;
  return films.filter(
    (film): film is ActressFilm =>
      !!film &&
      typeof film === 'object' &&
      typeof (film as ActressFilm).code === 'string' &&
      typeof (film as ActressFilm).title === 'string' &&
      typeof (film as ActressFilm).date === 'string',
  );
}

export function useActressFilms() {
  const [films, setFilms] = useState<ActressFilm[]>([]);
  const [status, setStatus] = useState<ActressFilmsStatus>('idle');
  const requestId = useRef(0);

  const load = useCallback(async (avBaseUrl: string) => {
    const id = ++requestId.current;
    setStatus('loading');
    try {
      const response = await fetch(
        `/api/actress-films?avBaseUrl=${encodeURIComponent(avBaseUrl)}`,
        { cache: 'no-store' },
      );
      const parsed = response.ok
        ? parseFilmsResponse(await response.json())
        : null;
      if (id !== requestId.current) return;
      if (parsed === null) {
        setFilms([]);
        setStatus('unavailable');
        return;
      }
      setFilms(parsed);
      setStatus(parsed.length ? 'ready' : 'empty');
    } catch {
      if (id !== requestId.current) return;
      setFilms([]);
      setStatus('unavailable');
    }
  }, []);

  const reset = useCallback(() => {
    requestId.current++;
    setFilms([]);
    setStatus('idle');
  }, []);

  return { films, status, load, reset };
}
