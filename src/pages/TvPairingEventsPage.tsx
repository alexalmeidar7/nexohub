import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Tv, Clock, User, Globe, AlertCircle, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";

type PairingEvent = {
  id: string;
  created_at: string;
  event_type: string;
  reason: string | null;
  code: string | null;
  tv_session_id: string | null;
  user_slug: string | null;
  slug_user_id: string | null;
  paired_user_id: string | null;
  paired_email: string | null;
  user_agent: string | null;
  ip: string | null;
  meta: unknown;
};

const EVENT_STYLES: Record<string, { label: string; className: string; Icon: typeof Tv }> = {
  created: { label: "Código criado", className: "bg-sky-500/15 text-sky-300 border-sky-500/30", Icon: Tv },
  scanned: { label: "QR escaneado", className: "bg-violet-500/15 text-violet-300 border-violet-500/30", Icon: User },
  code_entered: { label: "Código digitado", className: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30", Icon: User },
  claimed: { label: "Pareado", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", Icon: CheckCircle2 },
  expired: { label: "Expirado", className: "bg-amber-500/15 text-amber-300 border-amber-500/30", Icon: Clock },
  error: { label: "Erro", className: "bg-rose-500/15 text-rose-300 border-rose-500/30", Icon: AlertCircle },
};

function EventBadge({ type }: { type: string }) {
  const style = EVENT_STYLES[type] || { label: type, className: "bg-slate-500/15 text-slate-300 border-slate-500/30", Icon: Tv };
  const { Icon } = style;
  return (
    <Badge variant="outline" className={`gap-1.5 ${style.className}`}>
      <Icon className="h-3 w-3" />
      {style.label}
    </Badge>
  );
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return iso; }
}

export default function TvPairingEventsPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<PairingEvent[] | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [searchedId, setSearchedId] = useState<string>("");

  const search = useCallback(async () => {
    const id = input.trim();
    if (!id) {
      toast.error("Informe um tv_session_id");
      return;
    }
    setLoading(true);
    setSearchedId(id);
    try {
      const { data, error } = await supabase
        .from("tv_pairing_events")
        .select("id, created_at, event_type, reason, code, tv_session_id, user_slug, slug_user_id, paired_user_id, paired_email, user_agent, ip, meta")
        .eq("tv_session_id", id)
        .order("created_at", { ascending: true })
        .returns<PairingEvent[]>();
      if (error) throw error;
      setEvents(data || []);
      if (!data || data.length === 0) {
        toast.info("Nenhum evento encontrado para essa sessão.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao buscar eventos.";
      toast.error(msg);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [input]);

  const sorted = useMemo(() => {
    if (!events) return [];
    const copy = [...events];
    copy.sort((a, b) => {
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return sortDir === "asc" ? da - db : db - da;
    });
    return copy;
  }, [events, sortDir]);

  const summary = useMemo(() => {
    const s: Record<string, number> = {};
    (events || []).forEach((e) => { s[e.event_type] = (s[e.event_type] || 0) + 1; });
    return s;
  }, [events]);

  const copy = async (text: string, label = "Copiado") => {
    try { await navigator.clipboard.writeText(text); toast.success(label); } catch { toast.error("Falha ao copiar"); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-6">
        <header className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Tv className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Eventos de pareamento da TV</h1>
            <p className="text-sm text-muted-foreground">Histórico detalhado por <code className="text-xs">tv_session_id</code>.</p>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Buscar sessão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Cole o tv_session_id (uuid)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") search(); }}
                className="font-mono text-sm"
                autoFocus
              />
              <Button onClick={search} disabled={loading || !input.trim()} className="gap-2 min-w-[120px]">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar
              </Button>
            </div>
            {searchedId && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Sessão:</span>
                <code className="font-mono px-2 py-0.5 rounded bg-muted">{searchedId}</code>
                <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => copy(searchedId, "ID copiado")}>
                  <Copy className="h-3 w-3" /> copiar
                </button>
                {events && (
                  <span className="ml-auto">
                    {events.length} evento(s) · ordenar:
                    <button
                      className="ml-2 underline underline-offset-2 hover:text-foreground"
                      onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    >
                      {sortDir === "asc" ? "mais antigos primeiro" : "mais recentes primeiro"}
                    </button>
                  </span>
                )}
              </div>
            )}
            {events && events.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {Object.entries(summary).map(([k, v]) => (
                  <div key={k} className="text-xs">
                    <EventBadge type={k} />
                    <span className="ml-1 text-muted-foreground">× {v}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {events && events.length === 0 && !loading && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              Nenhum evento encontrado para <code className="font-mono">{searchedId}</code>.
            </CardContent>
          </Card>
        )}

        {sorted.length > 0 && (
          <div className="relative">
            <div className="absolute left-4 top-2 bottom-2 w-px bg-border" aria-hidden />
            <ul className="space-y-3">
              {sorted.map((ev, i) => {
                const style = EVENT_STYLES[ev.event_type];
                const Icon = style?.Icon || Tv;
                return (
                  <li key={ev.id} className="relative pl-12">
                    <span className={`absolute left-1.5 top-4 h-5 w-5 rounded-full border-2 flex items-center justify-center bg-background ${style?.className || "border-slate-500/30 text-slate-300"}`}>
                      <Icon className="h-2.5 w-2.5" />
                    </span>
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">#{i + 1}</span>
                          <EventBadge type={ev.event_type} />
                          {ev.reason && (
                            <Badge variant="outline" className="text-xs">{ev.reason}</Badge>
                          )}
                          {ev.code && (
                            <Badge variant="secondary" className="font-mono tracking-widest">{ev.code}</Badge>
                          )}
                          <span className="ml-auto text-xs text-muted-foreground inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {fmtDate(ev.created_at)}
                          </span>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-2 text-xs">
                          {ev.paired_email && (
                            <div className="flex items-center gap-2">
                              <User className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Usuário:</span>
                              <span className="font-mono truncate">{ev.paired_email}</span>
                            </div>
                          )}
                          {ev.user_slug && (
                            <div className="flex items-center gap-2">
                              <Tv className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Slug:</span>
                              <span className="font-mono">{ev.user_slug}</span>
                            </div>
                          )}
                          {ev.ip && (
                            <div className="flex items-center gap-2">
                              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">IP:</span>
                              <span className="font-mono">{ev.ip}</span>
                            </div>
                          )}
                          {ev.user_agent && (
                            <div className="flex items-start gap-2 sm:col-span-2">
                              <Globe className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                              <span className="text-muted-foreground shrink-0">UA:</span>
                              <span className="font-mono break-all text-[11px] leading-relaxed">{ev.user_agent}</span>
                            </div>
                          )}
                        </div>

                        {ev.meta && Object.keys(ev.meta as Record<string, unknown>).length > 0 && (
                          <details className="rounded-lg border border-border bg-muted/30">
                            <summary className="cursor-pointer text-xs px-3 py-2 text-muted-foreground hover:text-foreground select-none">
                              meta ({Object.keys(ev.meta as Record<string, unknown>).length} campo(s))
                            </summary>
                            <pre className="text-[11px] font-mono px-3 pb-3 overflow-auto whitespace-pre-wrap break-all">
{JSON.stringify(ev.meta, null, 2)}
                            </pre>
                          </details>
                        )}
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
