type CaptureElement = HTMLMediaElement & { captureStream?: () => MediaStream };
const captures = new WeakMap<HTMLMediaElement, { stream: MediaStream; users: number }>();
/** One capture per media element, shared by all visualizations without extra streams. */
export function acquireCapturedAudio(element: HTMLMediaElement) {
  let record = captures.get(element);
  if (!record || !record.stream.active) {
    const capture = (element as CaptureElement).captureStream;
    if (!capture) return null;
    record = { stream: capture.call(element), users: 0 }; captures.set(element, record);
  }
  record.users++;
  const retained = record;
  let released = false;
  return { stream: record.stream, release() {
    if (released) return; released = true;
    retained.users--;
    if (retained.users === 0) { retained.stream.getTracks().forEach(track => track.stop()); if(captures.get(element)===retained)captures.delete(element); }
  } };
}
