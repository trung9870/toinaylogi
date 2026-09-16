import { refreshActressData } from './crawler';
import { isDue } from './store';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const RETRY = 15 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
let started = false;
let timer: NodeJS.Timeout | undefined;

async function schedule() {
  let delay = HOUR;
  try {
    if (await isDue()) delay = (await refreshActressData()) ? WEEK : RETRY;
  } catch (error) {
    // takeLock writes into .cache/ before refreshActressData can catch anything;
    // a read-only or full disk must not surface as an unhandled rejection.
    console.warn(
      `[jav-crawler] Scheduler paused: ${error instanceof Error ? error.message : String(error)}`,
    );
    delay = RETRY;
  }
  timer = setTimeout(() => void schedule(), delay);
  timer.unref();
}

export function startActressRefreshScheduler() {
  // Hosted deploys ship a prebuilt snapshot on a read-only filesystem.
  if (started || process.env.VERCEL) return;
  started = true;
  void schedule();
}
