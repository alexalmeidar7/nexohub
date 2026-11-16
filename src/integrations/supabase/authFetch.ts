// Auth can return 500/504 during service interruptions. Bound each request and
// abort abandoned work so retries do not accumulate in the browser.
export const authResilientFetch: typeof fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const requestUrl = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  if (!requestUrl.includes("/auth/v1/")) return fetch(input, init);

  const controller = new AbortController();
  const callerSignal = init.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException("Auth request timed out", "TimeoutError"));
  }, 11000);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
};
