import type { VmixRemoteRoom } from "./vmixRemoteRoom";
import { limitPreviewSender, PREVIEW_FRAME_RATE, previewRate, type PreviewVideoRate } from "./vmixPreviewMedia";

type Capture = { stream: MediaStream; stop: () => void; ended?: Promise<void> };
type Publisher = (signal: AbortSignal, rate: PreviewVideoRate) => Promise<Capture>;
export class VmixPreviewSession {
  private publisher: Publisher | null = null;
  private peer: RTCPeerConnection | null = null;
  private capture: Capture | null = null;
  private abort: AbortController | null = null;
  private target = "";
  private session = "";
  private rate: PreviewVideoRate = 500;
  private candidates: RTCIceCandidateInit[] = [];
  private lastKeepAlive = 0;
  private watching = false;
  private lastHello = 0;
  private lastHost = "";
  private peerTimeout: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: () => void;
  private unlisten: () => void;
  private timer: ReturnType<typeof setInterval>;

  constructor(private room: VmixRemoteRoom, private host: boolean, private iceServers: RTCIceServer[],
    private status: (value: string) => void, private stream: (value: MediaStream | null) => void) {
    this.unsubscribe = room.listenMedia(message => { void this.receive(message).catch(error => { if (!message.session || message.session === this.session) this.fail(error); }); });
    this.unlisten = room.listen(() => {
      const next = room.state.available ? room.state.hostId || "" : "";
      if (next !== this.lastHost) { this.lastHost = next; this.disconnect(); if (!host && this.watching) this.hello(); }
    });
    this.timer = setInterval(() => {
      if (host && this.target && Date.now() - this.lastKeepAlive > 12_000) { this.disconnect(); this.status("Envio habilitado · sem operador assistindo."); }
      if (!host && this.watching) {
        if (this.target) void this.send("keepalive", this.target);
        if (!this.peer && Date.now() - this.lastHello > 15_000) this.hello();
      }
    }, 3000);
  }
  private send(kind: string, target?: string, data = {}) {
    return this.room.sendMedia({ kind, target, session: this.session, ...data });
  }
  setPublisher(publisher: Publisher | null) {
    this.publisher = publisher;
    this.disconnect();
    if (this.host) void this.send("status", undefined, { enabled: !!publisher });
  }
  watch(rate: PreviewVideoRate) { this.rate = previewRate(rate); this.watching = true; this.disconnect(); this.hello(); }
  stopWatching() { this.watching = false; this.disconnect(); this.status("Retorno pausado."); }
  private hello() {
    const target = this.room.state.available && this.room.state.hostId;
    if (!target) { this.status("Aguardando o HMD da rádio."); return; }
    this.target = target;
    this.session = crypto.randomUUID();
    this.lastHello = Date.now();
    void this.send("hello", target, { rate: this.rate });
    this.status("Aguardando autorização do retorno no HMD da rádio.");
  }
  private makePeer(target: string, session: string) {
    this.target = target; this.session = session;
    const pc = this.peer = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peerTimeout = setTimeout(() => { if (this.peer === pc && pc.connectionState !== "connected") this.fail(new Error("O retorno não conectou entre as redes. Verifique o relay gratuito do estúdio.")); }, 30_000);
    pc.onicecandidate = event => {
      if (event.candidate && this.peer === pc) void this.send("ice", target, { candidate: event.candidate.toJSON() });
    };
    pc.ontrack = event => { if (!this.host && this.peer === pc) this.stream(event.streams[0] || new MediaStream([event.track])); };
    pc.onconnectionstatechange = () => {
      if (this.peer !== pc) return;
      if (pc.connectionState === "connected") { clearTimeout(this.peerTimeout); this.status(this.host ? "Enviando retorno remoto." : "Retorno ao vivo."); }
      if (pc.connectionState === "disconnected") {
        clearTimeout(this.peerTimeout);
        this.peerTimeout = setTimeout(() => { if (this.peer === pc && pc.connectionState !== "connected") this.fail(new Error("A conexão do retorno foi interrompida.")); }, 5000);
      }
      if (pc.connectionState === "failed") this.fail(new Error("A conexão de mídia entre as redes falhou. Verifique o relay gratuito do estúdio."));
    };
    return pc;
  }
  private async receive(message: any) {
    if (typeof message.kind !== "string") return;
    if (!this.host && message.kind === "status" && message.sender === this.room.state.hostId) {
      if (!message.enabled) { this.disconnect(); this.status("Envio do retorno desligado no HMD da rádio."); }
      else if (this.watching && !this.peer) this.hello();
      return;
    }
    if (message.target !== this.room.actorId) return;
    if (this.host && message.kind === "hello") {
      if (this.room.state.hostId !== this.room.actorId) return;
      if (!this.publisher) { await this.send("status", message.sender, { enabled: false }); return; }
      if (typeof message.session !== "string" || message.session.length > 64) return;
      if (this.target && (this.target !== message.sender || this.session === message.session)) return;
      this.disconnect();
      this.target = message.sender; this.session = message.session; this.lastKeepAlive = Date.now();
      this.status("Preparando vídeo e áudio da mesa…");
      const abort = this.abort = new AbortController();
      const rate = this.rate = previewRate(message.rate);
      const capture = await this.publisher(abort.signal, rate);
      if (abort.signal.aborted) { capture.stop(); return; }
      this.capture = capture;
      void capture.ended?.then(() => { if (this.capture === capture) this.fail(new Error("A fonte NDI do retorno foi interrompida.")); });
      const pc = this.makePeer(message.sender, message.session);
      for (const track of capture.stream.getTracks()) {
        const transceiver = pc.addTransceiver(track, { direction: "sendonly", streams: [capture.stream],
          sendEncodings: [{ maxBitrate: track.kind === "audio" ? 64_000 : rate * 1000, ...(track.kind === "video" ? { maxFramerate: PREVIEW_FRAME_RATE } : {}) }] });
        if (track.kind === "audio") {
          const opus = RTCRtpSender.getCapabilities("audio")?.codecs.filter(c => c.mimeType.toLowerCase() === "audio/opus");
          if (opus?.length) transceiver.setCodecPreferences(opus);
        }
      }
      await pc.setLocalDescription(await pc.createOffer());
      if (this.peer === pc) await this.send("offer", this.target, { description: pc.localDescription?.toJSON(), rate });
      return;
    }
    if (message.sender !== this.target || message.session !== this.session) return;
    if (message.kind === "stop") { this.disconnect(); this.status(this.host && this.publisher ? "Envio habilitado · sem operador assistindo." : "Retorno remoto encerrado."); return; }
    if (message.kind === "keepalive" && this.host) { this.lastKeepAlive = Date.now(); return; }
    if (message.kind === "error") { this.disconnect(); this.status(String(message.message || "Retorno indisponível.").slice(0, 200)); return; }
    if (message.kind === "offer" && !this.host && this.watching && message.sender === this.room.state.hostId) {
      if (typeof message.description?.sdp !== "string" || message.description.sdp.length > 64000 || message.description.type !== "offer") return;
      const pc = this.makePeer(message.sender, message.session);
      this.status("Conectando retorno remoto…");
      await pc.setRemoteDescription(message.description);
      await pc.setLocalDescription(await pc.createAnswer());
      await this.send("answer", this.target, { description: pc.localDescription?.toJSON() });
    } else if (message.kind === "answer" && this.host && this.peer) {
      if (typeof message.description?.sdp !== "string" || message.description.sdp.length > 64000 || message.description.type !== "answer") return;
      await this.peer.setRemoteDescription(message.description);
      for (const sender of this.peer.getSenders()) await limitPreviewSender(sender, previewRate(message.rate || this.rate));
    } else if (message.kind === "ice" && message.candidate && String(message.candidate.candidate).length < 4096) {
      if (this.peer?.remoteDescription) await this.peer.addIceCandidate(message.candidate);
      else if (this.candidates.length < 64) this.candidates.push(message.candidate);
    }
    if (this.peer?.remoteDescription) for (const candidate of this.candidates.splice(0)) await this.peer.addIceCandidate(candidate);
  }
  private fail(error: unknown) {
    const message = error instanceof Error ? error.message : "Falha no retorno remoto.";
    if (this.target) void this.send("error", this.target, { message });
    this.disconnect(); this.status(message);
  }
  private disconnect() {
    clearTimeout(this.peerTimeout);
    if (this.target && this.session) void this.send("stop", this.target);
    this.abort?.abort(); this.abort = null;
    this.capture?.stop(); this.capture = null;
    this.peer?.close(); this.peer = null;
    this.target = ""; this.session = ""; this.candidates = [];
    this.stream(null);
  }
  close() { this.watching = false; this.publisher = null; this.disconnect(); this.unsubscribe(); this.unlisten(); clearInterval(this.timer); }
}
