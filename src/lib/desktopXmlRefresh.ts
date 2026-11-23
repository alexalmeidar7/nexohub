/** Completion-based refresh: coalesce realtime bursts and never overlap cycles. */
export function createDesktopXmlRefresh(sync: () => Promise<void>, interval = 60_000) {
  let running = false, pending = false, stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let clockTimer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    if (stopped) return;
    if (running) { pending = true; return; }
    running = true;
    try { await sync(); }
    finally {
      running = false;
      if (!stopped) {
        timer = setTimeout(() => void run(), pending ? 250 : interval);
        pending = false;
      }
    }
  };
  const clock = () => {
    clockTimer = setTimeout(() => {
      if (stopped) return;
      if (running) pending = true;
      else { clearTimeout(timer); void run(); }
      clock();
    }, 60_000 - Date.now() % 60_000 + 25);
  };
  clock();
  return {
    request() {
      if (stopped) return;
      if (running) { pending = true; return; }
      clearTimeout(timer);
      timer = setTimeout(() => void run(), 250);
    },
    stop() { stopped = true; clearTimeout(timer); clearTimeout(clockTimer); },
  };
}
