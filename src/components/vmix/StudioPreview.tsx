import { useEffect, useRef, useState } from "react";
import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { acquireVmixRoom } from "@/lib/vmixRemoteRooms";
import { VmixPreviewSession } from "@/lib/vmixPreviewSession";
import { captureNdiPreview, PREVIEW_VIDEO_RATES, previewRate, type PreviewVideoRate } from "@/lib/vmixPreviewMedia";
import { supabase } from "@/integrations/supabase/client";
import FloatingNdiPreview from "./FloatingNdiPreview";

export default function StudioPreview({ connectionId, remote, ...previewProps }: {
  connectionId: string | null;
  remote: boolean;
  inputs: { key: string; number: string; title: string; type: string }[];
  baseUrl: string;
  targetSelector?: string;
  onRefreshSources?: () => Promise<unknown> | void;
}) {
  const host = !remote && !!window.houseMixDesktop?.isDesktop;
  const [session, setSession] = useState<VmixPreviewSession | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [watching, setWatching] = useState(true);
  const [rate, setRate] = useState<PreviewVideoRate>(500);
  const [status, setStatus] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [sources, setSources] = useState<{ name: string; address: string }[]>([]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [audioSource, setAudioSource] = useState("");
  const [muted, setMuted] = useState(true);
  const [relayConfigured, setRelayConfigured] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setEnabled(false);
    setSession(null);
    if (!connectionId || (!host && !remote)) return;
    let closed = false;
    let cleanup: (() => void) | undefined;
    try { setAudioSource(localStorage.getItem(`vmix:preview-audio:${connectionId}`) || ""); } catch {}
    void (async () => {
      const { room, release } = await acquireVmixRoom(connectionId);
      if (closed) { release(); return; }
      try {
        const { data, error } = await supabase.functions.invoke("vmix-preview-ice", { body: { connectionId } });
        if (error || !Array.isArray(data?.iceServers)) throw new Error("Não foi possível autorizar a conexão de mídia deste estúdio.");
        if (closed) { release(); return; }
        setRelayConfigured(data.relayConfigured === true);
        const link = new VmixPreviewSession(room, host, data.iceServers, setStatus, setStream);
        cleanup = () => { link.close(); release(); };
        setSession(link);
      } catch (error) { release(); if (!closed) setStatus(error instanceof Error ? error.message : "Falha ao preparar o retorno."); }
    })().catch(error => { if (!closed) setStatus(String(error)); });
    return () => { closed = true; cleanup?.(); };
  }, [connectionId, host, remote]);

  useEffect(() => {
    if (!session || !host) return;
    session.setPublisher(enabled && image && audioSource ? signal => captureNdiPreview(image, audioSource, signal) : null);
    setStatus(enabled ? image && audioSource ? "Envio habilitado · aguardando operador remoto." : "Selecione as fontes de vídeo e áudio para o envio." : "Envio remoto desligado.");
    return () => session.setPublisher(null);
  }, [session, host, enabled, image, audioSource]);
  useEffect(() => {
    if (!session || !remote) return;
    if (watching) session.watch(rate); else session.stopWatching();
    return () => session.stopWatching();
  }, [session, remote, watching, rate]);
  useEffect(() => {
    if (!video.current) return;
    video.current.srcObject = stream;
    if (stream) void video.current.play().catch(() => {});
  }, [stream]);

  const controls = host ? <div className="mb-2 rounded-md border border-white/10 p-2 text-white">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-bold">Retorno remoto</span>
      <button type="button" aria-pressed={enabled} disabled={!enabled && (!session || !image || !audioSource)} onClick={() => setEnabled(v => !v)} className={`rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40 ${enabled ? "bg-red-700" : "bg-blue-600"}`}>{enabled ? "Desligar envio" : "Habilitar envio"}</button>
    </div>
    <label className="mt-2 block text-[10px] text-slate-300">Áudio da mesa · fonte NDI
      <select value={audioSource} onChange={event => {
        setAudioSource(event.target.value);
        try { localStorage.setItem(`vmix:preview-audio:${connectionId}`, event.target.value); } catch {}
      }} className="mt-1 h-8 w-full min-w-0 rounded border border-[#314766] bg-[#0c1525] px-2 text-[10px] text-white">
        <option value="">Selecione o NDI da mesa…</option>
        {audioSource && !sources.some(s => s.name === audioSource) && <option value={audioSource}>{audioSource} (aguardando rede)</option>}
        {sources.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
      </select>
    </label>
    <p className="mt-1 text-[9px] text-slate-400">Áudio 64 Kbps · vídeo 300, 500 ou 900 Kbps. Sem operador assistindo, não há envio.</p>
    {status && <p role="status" className="mt-1 text-[10px] text-slate-300">{status}</p>}
    {!relayConfigured && <p className="mt-1 text-[9px] text-amber-200">Conexão direta disponível. Relay gratuito entre redes ainda não configurado.</p>}
  </div> : undefined;

  if (!remote) return <FloatingNdiPreview {...previewProps} controls={controls} onSources={setSources} onImage={setImage} onPreviewHidden={() => setEnabled(false)} />;
  return <aside aria-label="Retorno remoto de vídeo e áudio" className="fixed bottom-16 right-4 z-[60] w-[min(340px,calc(100vw-32px))] overflow-hidden rounded-xl border border-[#314766] bg-[#111b2d] text-white shadow-2xl">
    <header className="flex items-center gap-2 border-b border-[#314766] bg-[#17243d] px-3 py-2">
      <span className={`h-2 w-2 rounded-full ${stream ? "bg-lime-400" : "bg-slate-500"}`} />
      <span className="flex-1 text-[10px] font-black uppercase">Retorno remoto</span>
      <select aria-label="Qualidade do vídeo remoto" value={rate} onChange={e => setRate(previewRate(Number(e.target.value)))} className="rounded border border-white/15 bg-slate-900 p-1 text-[10px]">
        {PREVIEW_VIDEO_RATES.map(value => <option key={value} value={value}>{value} Kbps</option>)}
      </select>
      <button type="button" onClick={() => setWatching(v => !v)} aria-label={watching ? "Pausar retorno" : "Receber retorno"} className="p-1">{watching ? <Pause size={13} /> : <Play size={13} />}</button>
    </header>
    <div className="relative m-2 aspect-video overflow-hidden rounded-md bg-black">
      <video ref={video} autoPlay playsInline muted={muted} controls className="h-full w-full object-contain" />
      {!stream && <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-[11px] text-slate-300">{status || "Preparando retorno remoto…"}</div>}
    </div>
    <div className="flex items-center gap-2 px-3 pb-2 text-[10px]">
      <button type="button" onClick={() => { setMuted(v => !v); void video.current?.play().catch(() => {}); }} className="flex items-center gap-1 rounded border border-white/20 px-2 py-1">{muted ? <VolumeX size={13} /> : <Volume2 size={13} />}{muted ? "Ouvir mesa" : "Silenciar"}</button>
      <span className="flex-1 truncate text-slate-400" title={status}>{stream ? "Áudio 64 Kbps" : status}</span>
      <button type="button" aria-label="Ampliar retorno" onClick={() => void video.current?.requestFullscreen().catch(() => {})}><Maximize2 size={13} /></button>
    </div>
  </aside>;
}
