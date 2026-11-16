import type { RealtimeChannel } from "@supabase/supabase-js";

export interface VmixRemoteState {
  joined: boolean;
  available: boolean;
  hostId: string | null;
  studioName: string;
  xml: string;
  error: string;
  lastAction: string;
}
export type VmixHostExecutor = (paths: string[], label: string, expiresAt: number) => Promise<string>;
const COMMAND_TTL = 30_000;
export const validVmixPaths = (paths: unknown): paths is string[] => Array.isArray(paths) && paths.length > 0 && paths.length <= 64 &&
  paths.every(p => typeof p === "string" && p.length <= 8192 && /^\/api\/(?:\?[^#\r\n]*)?$/.test(p));

/** One private room per saved studio; commands are never replayed after timeout. */
export class VmixRemoteRoom {
  readonly actorId = crypto.randomUUID();
  state: VmixRemoteState = { joined: false, available: false, hostId: null, studioName: "", xml: "", error: "", lastAction: "" };
  private listeners = new Set<() => void>();
  private pending = new Map<string, { hostId: string; resolve: (value: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private seen = new Map<string, { at: number; result: Promise<{ body?: string; error?: string }> }>();
  private executor: VmixHostExecutor | null = null;
  private hostXml = "";
  private hostName = "";
  private lastAnnounce = 0;
  private lastHostSeen = 0;
  private queue = Promise.resolve();
  private closed = false;
  private expiryTimer: ReturnType<typeof setInterval>;

  constructor(private channel: RealtimeChannel) {
    channel.on("broadcast", { event: "vmix-message" }, ({ payload }) => this.receive(payload))
      .on("presence", { event: "sync" }, () => this.syncPresence())
      .on("presence", { event: "join" }, () => { if (this.executor) void this.announce(this.hostXml, this.hostName, true); })
      .subscribe(status => {
        if (this.closed) return;
        this.state = { ...this.state, joined: status === "SUBSCRIBED", error: status === "CHANNEL_ERROR" ? "Não foi possível autorizar o controle remoto deste estúdio." : "" };
        if (status !== "SUBSCRIBED") this.state.available = false;
        else if (this.executor) void this.announce(this.hostXml, this.hostName, true);
        this.notify();
      });
    this.expiryTimer = setInterval(() => {
      if (this.state.available && Date.now() - this.lastHostSeen > 12_000) {
        this.state = { ...this.state, available: false, xml: "" };
        this.notify();
      }
    }, 2000);
  }

  listen(callback: () => void) { this.listeners.add(callback); callback(); return () => { this.listeners.delete(callback); }; }
  private notify() { this.listeners.forEach(fn => fn()); }
  private send(payload: object) { return this.channel.send({ type: "broadcast", event: "vmix-message", payload }); }
  private syncPresence() {
    const hosts = Object.values(this.channel.presenceState()).flat().filter((p: any) => p.host === true && typeof p.actorId === "string") as unknown as Array<{ actorId: string; studioName: string }>;
    hosts.sort((a, b) => a.actorId.localeCompare(b.actorId));
    const host = hosts[0];
    const changed = this.state.hostId !== (host?.actorId || null);
    this.state = { ...this.state, hostId: host?.actorId || null, available: !!host && this.state.joined, studioName: host?.studioName || "", xml: changed ? "" : this.state.xml };
    this.lastHostSeen = Date.now();
    this.notify();
  }

  async announce(xml: string, studioName: string, force = false) {
    const changed = xml !== this.hostXml;
    this.hostXml = xml;
    this.hostName = studioName;
    if (!this.executor || !this.state.joined || this.closed) return;
    const ownPresence = Object.values(this.channel.presenceState()).flat().some((p: any) => p.actorId === this.actorId && p.host);
    if (!ownPresence) await this.channel.track({ actorId: this.actorId, host: true, studioName });
    if (force || changed || Date.now() - this.lastAnnounce >= 5000) {
      this.lastAnnounce = Date.now();
      await this.send({ kind: "state", hostId: this.actorId, studioName, xml: changed || force ? xml : undefined });
    }
  }

  async setHost(executor: VmixHostExecutor | null, studioName = "", xml = "") {
    const first = !this.executor;
    this.executor = executor;
    if (executor) await this.announce(xml, studioName, first);
    else {
      this.hostXml = "";
      if (this.state.joined) await this.channel.untrack();
    }
  }

  private receive(message: any) {
    if (this.closed || !message || typeof message !== "object") return;
    if (message.kind === "state" && message.hostId === this.state.hostId) {
      this.lastHostSeen = Date.now();
      this.state = { ...this.state, available: true, xml: typeof message.xml === "string" ? message.xml : this.state.xml };
      this.notify();
    }
    if (message.kind === "result" && message.target === this.actorId) {
      const pending = this.pending.get(message.id);
      if (!pending || message.hostId !== pending.hostId) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(String(message.error)));
      else pending.resolve(String(message.body || ""));
    }
    if (message.kind !== "request" || message.target !== this.actorId || !this.executor) return;
    if (typeof message.id !== "string" || typeof message.sender !== "string" || !validVmixPaths(message.paths) ||
      !Number.isFinite(message.expiresAt) || message.expiresAt <= Date.now() || message.expiresAt > Date.now() + COMMAND_TTL + 5000) return;
    const id = `${message.sender}:${message.id}`;
    for (const [key, value] of this.seen) if (Date.now() - value.at > 65_000) this.seen.delete(key);
    if (!this.seen.has(id)) {
      if (this.seen.size >= 512) return;
      const run = this.queue.then(async () => {
        if (!this.executor || this.closed || Date.now() >= message.expiresAt) throw new Error("Comando expirou antes da execução. Não foi reenviado.");
        if (message.paths.length === 1 && message.paths[0] === "/api/") return this.hostXml;
        const label = String(message.label || "Comando vMix").slice(0, 160);
        this.state = { ...this.state, lastAction: label };
        this.notify();
        window.dispatchEvent(new CustomEvent("vmix-remote-action", { detail: { label, actorId: this.actorId } }));
        return this.executor(message.paths, label, message.expiresAt);
      }).then(body => ({ body }), error => ({ error: error instanceof Error ? error.message : "Falha no HMD da rádio." }));
      this.queue = run.then(() => {});
      this.seen.set(id, { at: Date.now(), result: run });
    }
    void this.seen.get(id)!.result.then(result => this.send({ kind: "result", id: message.id, target: message.sender, hostId: this.actorId, ...result }));
  }

  async request(paths: string[], label = "Comando vMix") {
    if (!validVmixPaths(paths)) throw new Error("Comando vMix inválido.");
    // Presence may arrive just after the user selects a studio. Wait briefly,
    // without sending any command while the host is unknown.
    const deadline = Date.now() + 3500;
    while ((!this.state.joined || !this.state.available) && !this.closed && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
    const hostId = this.state.hostId;
    if (!this.state.available || !hostId || this.closed) throw new Error(this.state.error || "HMD da rádio indisponível. Mantenha o HMD aberto e conectado ao vMix no estúdio.");
    if (paths.length === 1 && paths[0] === "/api/" && this.state.xml) return this.state.xml;
    const id = crypto.randomUUID();
    return new Promise<string>((resolve, reject) => {
      const fail = (message: string) => {
        const item = this.pending.get(id);
        if (!item) return;
        clearTimeout(item.timer);
        this.pending.delete(id);
        reject(new Error(message));
      };
      const timer = setTimeout(() => fail("Sem confirmação do HMD da rádio. O comando não foi reenviado para evitar cortes duplicados."), COMMAND_TTL + 5000);
      this.pending.set(id, { hostId, resolve, reject, timer });
      void this.send({ kind: "request", id, sender: this.actorId, target: hostId, paths, label, expiresAt: Date.now() + COMMAND_TTL })
        .then(status => { if (status !== "ok") fail("Falha ao transmitir ao HMD. O comando não foi reenviado."); })
        .catch(() => fail("Conexão remota interrompida. O comando não foi reenviado."));
    }).then(body => {
      if (paths.length === 1 && paths[0] === "/api/") {
        this.state = { ...this.state, xml: body };
        this.notify();
      }
      return body;
    });
  }

  close() {
    this.closed = true;
    this.executor = null;
    clearInterval(this.expiryTimer);
    this.pending.forEach(p => { clearTimeout(p.timer); p.reject(new Error("Estúdio desconectado. Comando sem confirmação.")); });
    this.pending.clear();
    this.listeners.clear();
  }
}
