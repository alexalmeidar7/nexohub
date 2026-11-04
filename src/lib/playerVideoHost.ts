// O <video> do player vive num contêiner único e persistente. Ele fica estacionado fora da
// tela e é movido para o mini player quando o canal de vídeo está ativo (sem recriar o elemento).
const HOST_ID = "nexo-player-video-host";

const PARKED_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  left: "-9999px",
  top: "0",
  width: "320px",
  height: "180px",
  pointerEvents: "none",
  opacity: "0",
};

const MOUNTED_STYLE: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  left: "0",
  top: "0",
  width: "100%",
  height: "100%",
  pointerEvents: "auto",
  opacity: "1",
};

export function getPlayerVideoHost(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    Object.assign(host.style, PARKED_STYLE);
    document.body.appendChild(host);
  }
  return host;
}

export function mountPlayerVideoHost(slot: HTMLElement) {
  const host = getPlayerVideoHost();
  if (!host || host.parentElement === slot) return;
  Object.assign(host.style, MOUNTED_STYLE);
  slot.appendChild(host);
}

export function parkPlayerVideoHost() {
  const host = getPlayerVideoHost();
  if (!host || host.parentElement === document.body) return;
  Object.assign(host.style, PARKED_STYLE);
  document.body.appendChild(host);
}
