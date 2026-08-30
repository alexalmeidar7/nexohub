import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type VmixInputLike = { number: string | number; key?: string; title?: string; type?: string };

type Status = "idle" | "connecting" | "live" | "error";

const STORAGE_KEY = "vmix_snapshot_base";
const isNdiType = (t?: string) => /ndi|desktop/i.test(t || "");

function normalizeBase(raw?: string | null): string {
  if (!raw) return "";
  let v = raw.trim().replace(/\/+$/, "");
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "http://" + v;
  try {
    const u = new URL(v);
    if (!u.port) u.port = "8088";
    return `${u.protocol}//${u.hostname}:${u.port}`;
  } catch {
    return v;
  }
}

/** vMix serve a imagem estática do input por estes caminhos (varia por versão). */
function snapshotPaths(inputRef: string): string[] {
  const q = inputRef ? `?input=${encodeURIComponent(inputRef)}` : "";
  return [
    `/snapshot${q}`,
    `/api/?snapshot${inputRef ? `&input=${encodeURIComponent(inputRef)}` : ""}`,
    `/mjpeg${inputRef ? `?Input=${encodeURIComponent(inputRef)}` : ""}`,
  ];
}

export default function NdiWebrtcMonitor({
  vmixBaseUrl,
  inputs = [],
  onRefresh,
}: {
  vmixBaseUrl?: string;
  vmixUser?: string;
  vmixPass?: string;
  inputs?: VmixInputLike[];
  onRefresh?: () => void | Promise<void>;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const pathIndexRef = useRef(0);
  const [base, setBase] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [draftBase, setDraftBase] = useState("");
  const [source, setSource] = useState<string>("");
  const [fps, setFps] = useState(3);
  const [status, setStatus] = useState<Status>("idle");
  const [running, setRunning] = useState(true);

  // base efetiva: manual (salva) ou a do vMix conectado
  const effectiveBase = useMemo(() => normalizeBase(base || vmixBaseUrl), [base, vmixBaseUrl]);

  useEffect(() => {
    setDraftBase(effectiveBase.replace(/^https?:\/\//, ""));
  }, [effectiveBase]);

  const sources = useMemo(() => {
    const ndi = inputs.filter((i) => String(i?.number ?? "").trim() !== "" && isNdiType(i.type));
    return [
      { value: "", label: "OUTPUT 1 · PROGRAMA" },
      { value: "Preview", label: "PREVIEW" },
      ...ndi.map((i) => ({
        value: String(i.number),
        label: `NDI ${i.number} · ${(i.title || "Sem título").replace(/\s+/g, " ").trim()}`,
      })),
    ];
  }, [inputs]);

  const mixedContent = typeof window !== "undefined"
    && window.location.protocol === "https:"
    && effectiveBase.startsWith("http://");

  const paths = useMemo(() => snapshotPaths(source), [source]);

  // Polling do snapshot via <img> + cache-buster (não sofre pré-flight CORS)
  useEffect(() => {
    if (!effectiveBase || !running) {
      setStatus("idle");
      return;
    }
    pathIndexRef.current = 0;
    setStatus("connecting");
    let cancelled = false;
    let timer: number | undefined;

    const tick = () => {
      if (cancelled) return;
      const img = imageRef.current;
      if (!img) return;
      const path = paths[pathIndexRef.current % paths.length];
      const sep = path.includes("?") ? "&" : "?";
      img.src = `${effectiveBase}${path}${sep}t=${Date.now()}`;
    };

    const img = imageRef.current;
    if (img) {
      img.onload = () => {
        if (!cancelled) setStatus("live");
      };
      img.onerror = () => {
        if (cancelled) return;
        pathIndexRef.current += 1;
        if (pathIndexRef.current >= paths.length * 2) setStatus("error");
      };
    }

    tick();
    timer = window.setInterval(tick, Math.max(120, Math.round(1000 / fps)));

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      if (img) {
        img.onload = null;
        img.onerror = null;
      }
    };
  }, [effectiveBase, paths, fps, running]);

  const saveBase = useCallback(() => {
    const next = normalizeBase(draftBase);
    setBase(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage indisponível */
    }
    setStatus("connecting");
  }, [draftBase]);

  const statusMeta: Record<Status, { label: string; color: string }> = {
    idle: { label: "PARADO", color: "#6b7280" },
    connecting: { label: "CONECTANDO", color: "#facc15" },
    live: { label: "AO VIVO", color: "#C6F03C" },
    error: { label: "SEM SINAL", color: "#ef4444" },
  };
  const meta = statusMeta[status];

  return (
    <section>
      <div className="flex items-center justify-between mb-2.5 gap-2">
        <h3 className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: "#C6F03C" }}>
          Preview vMix (Snapshot)
        </h3>
        <span
          className="flex items-center gap-1.5 text-[9px] font-black tracking-widest px-2 py-0.5 rounded"
          style={{ backgroundColor: "#0f0f0f", color: meta.color, border: `1px solid ${meta.color}40` }}
        >
          <span
            className={status === "connecting" || status === "live" ? "animate-pulse" : ""}
            style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: meta.color, display: "inline-block" }}
          />
          {meta.label}
        </span>
      </div>

      {/* IP / porta do vMix local */}
      <div className="flex gap-1.5 mb-1.5">
        <input
          value={draftBase}
          onChange={(e) => setDraftBase(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveBase()}
          placeholder="192.168.0.10:8088"
          className="vmix-hover-ring flex-1 h-9 rounded text-[11px] font-bold tracking-wider px-2.5 outline-none"
          style={{ backgroundColor: "#1a1a1a", color: "#e5e5e5", border: "1px solid #C6F03C50" }}
        />
        <button
          type="button"
          onClick={saveBase}
          className="vmix-hover-ring h-9 px-2.5 rounded text-[9px] font-black uppercase tracking-widest"
          style={{ backgroundColor: "#C6F03C", color: "#000" }}
        >
          Salvar IP
        </button>
      </div>

      <div className="flex gap-1.5 mb-1.5">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="vmix-hover-ring flex-1 h-9 rounded text-[11px] font-bold uppercase tracking-wider px-2.5 outline-none"
          style={{ backgroundColor: "#1a1a1a", color: "#e5e5e5", border: "1px solid #C6F03C50" }}
        >
          {sources.map((s) => (
            <option key={s.value || "program"} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={fps}
          onChange={(e) => setFps(Number(e.target.value))}
          className="vmix-hover-ring h-9 rounded text-[11px] font-bold uppercase tracking-wider px-2 outline-none"
          style={{ backgroundColor: "#1a1a1a", color: "#e5e5e5", border: "1px solid #C6F03C50" }}
          title="Taxa de atualização"
        >
          {[1, 2, 3, 5, 8].map((f) => (
            <option key={f} value={f}>{f} FPS</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            void onRefresh?.();
            setRunning((r) => !r);
            if (!running) setStatus("connecting");
          }}
          className="vmix-hover-ring h-9 px-2.5 rounded text-[9px] font-black uppercase tracking-widest"
          style={{ backgroundColor: running ? "#1a1a1a" : "#C6F03C", color: running ? "#C6F03C" : "#000", border: "1px solid #C6F03C50" }}
        >
          {running ? "Pausar" : "Iniciar"}
        </button>
      </div>

      <div
        className="relative w-full overflow-hidden rounded"
        style={{ paddingBottom: "56.25%", backgroundColor: "#000", border: "1px solid #C6F03C25" }}
      >
        <img
          ref={imageRef}
          alt="Preview vMix"
          className="absolute"
          style={{
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            visibility: status === "live" ? "visible" : "hidden",
          }}
        />
        {status !== "live" && (
          <div
            className="absolute flex flex-col items-center justify-center text-center px-3 gap-1"
            style={{ top: 0, left: 0, right: 0, bottom: 0, color: "#ffffff40" }}
          >
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
              {!effectiveBase
                ? "Informe o IP:porta do vMix"
                : status === "connecting"
                  ? "Conectando…"
                  : status === "error"
                    ? "Sem imagem do snapshot"
                    : "Preview pausado"}
            </span>
          </div>
        )}
      </div>

      {mixedContent && (
        <p className="text-[9px] font-bold uppercase tracking-wider mt-2 leading-relaxed" style={{ color: "#facc15" }}>
          Painel em HTTPS acessando vMix em HTTP: o navegador pode bloquear a imagem (mixed content).
          Libere “Conteúdo não seguro” para este site nas permissões do navegador, ou abra o painel via
          http:// na rede local.
        </p>
      )}
      <p className="text-[9px] font-bold uppercase tracking-wider mt-1.5" style={{ color: "#ffffff45" }}>
        {effectiveBase ? `Snapshot de ${effectiveBase} · ${fps} FPS` : "Nenhum endereço configurado"}
      </p>
    </section>
  );
}
