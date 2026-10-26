/** One request at a time; realtime remains the immediate update path. */
export function startMusicSyncPolling(
  sync: () => Promise<void>,
  isRealtimeConnected: () => boolean,
) {
  let stopped = false;
  let running = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await sync();
      failures = 0;
    } catch {
      failures = Math.min(failures + 1, 5);
    } finally {
      running = false;
      if (!stopped) {
        const delay = failures > 0
          ? Math.min(300_000, 15_000 * 2 ** failures)
          : isRealtimeConnected() ? 15_000 : 20_000;
        timer = setTimeout(() => { void run(); }, delay);
      }
    }
  };

  void run();
  return {
    refresh: () => {
      if (stopped || running) return;
      clearTimeout(timer);
      void run();
    },
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}