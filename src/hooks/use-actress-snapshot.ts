import { useEffect, useRef, useState } from 'react';
import {
  SNAPSHOT_SCHEMA_VERSION,
  validateCurrent,
  validateSnapshot,
  type ActressSnapshot,
  type RefreshStatus,
} from '@/lib/actresses';

const root = '/actress-cache';
const idle: RefreshStatus = {
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  state: 'refreshing',
  updatedAt: '',
  message: 'Starting local refresh',
};

async function fetchJson(path: string) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json() as Promise<unknown>;
}
function validateStatus(value: unknown): RefreshStatus | null {
  if (!value || typeof value !== 'object') return null;
  const status = value as Record<string, unknown>;
  return (status.schemaVersion === SNAPSHOT_SCHEMA_VERSION ||
    status.schemaVersion === 3) &&
    ['idle', 'refreshing', 'error'].includes(String(status.state)) &&
    typeof status.updatedAt === 'string'
    ? {
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        state: status.state as RefreshStatus['state'],
        updatedAt: status.updatedAt,
        message:
          typeof status.message === 'string'
            ? status.message.slice(0, 280)
            : undefined,
        attempt: Number.isSafeInteger(status.attempt)
          ? Number(status.attempt)
          : undefined,
      }
    : null;
}

export function useActressSnapshot() {
  const [snapshot, setSnapshot] = useState<ActressSnapshot | null>(null);
  const [status, setStatus] = useState<RefreshStatus>(idle);
  const [error, setError] = useState('');
  const startedAt = useRef<number | null>(null);
  const snapshotRef = useRef<ActressSnapshot | null>(null);
  const previousId = useRef('');
  useEffect(() => {
    startedAt.current ??= Date.now();
    let live = true;
    const poll = async () => {
      try {
        const rawStatus = await fetchJson(`${root}/status.json`).catch(
          () => null,
        );
        const parsedStatus = rawStatus ? validateStatus(rawStatus) : null;
        if (live && parsedStatus) {
          setStatus(parsedStatus);
          if (parsedStatus.state === 'error' && !snapshotRef.current)
            setError('initial-cache-unavailable');
        }
        const current = validateCurrent(
          await fetchJson(`${root}/current.json`),
        );
        if (!current) throw new Error('No current snapshot');
        if (current.snapshotId !== previousId.current) {
          const next = validateSnapshot(await fetchJson(current.snapshotPath));
          if (!next) throw new Error('Invalid snapshot');
          if (!live) return;
          previousId.current = current.snapshotId;
          snapshotRef.current = next;
          setSnapshot(next);
        }
        if (live) setError('');
      } catch (err) {
        console.warn('[useActressSnapshot] Failed to load snapshot:', err);
        if (live && !snapshotRef.current) {
          setError('initial-cache-unavailable');
        }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 4000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);
  return { snapshot, status, error };
}
