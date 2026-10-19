import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Calendar as CalIcon, RefreshCw, Link2, Unlink, ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface GEvent {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  htmlLink: string;
}

interface GoogleCalendarSyncProps {
  compact?: boolean;
}

export default function GoogleCalendarSync({ compact = false }: GoogleCalendarSyncProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<GEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchEvents = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-events");
      if (error) throw error;
      setConnected(!!data?.connected);
      setEvents(data?.events || []);
    } catch (e) {
      console.error("Erro ao carregar eventos do Google Agenda:", e);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleConnect = async () => {
    const popup = window.open("about:blank", "google-cal", "width=520,height=640");
    if (!popup) {
      toast({ title: "Janela bloqueada", description: "Permita pop-ups para conectar o Google Agenda.", variant: "destructive" });
      return;
    }
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-auth", { method: "POST" });
      if (error || !data?.url) throw error || new Error("Não foi possível iniciar a autorização.");
      popup.location.href = data.url;
      const t = window.setInterval(async () => {
        if (popup.closed) {
          window.clearInterval(t);
          setConnecting(false);
          await fetchEvents();
        }
      }, 1000);
    } catch (e: any) {
      popup.close();
      toast({ title: "Erro ao conectar", description: e?.message || "Tente novamente.", variant: "destructive" });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    const { error } = await supabase.functions.invoke("google-calendar-disconnect", { method: "POST" });
    if (error) {
      toast({ title: "Não foi possível desconectar", description: error.message, variant: "destructive" });
      return;
    }
    setConnected(false);
    setEvents([]);
    toast({ title: "Google Agenda desconectado" });
  };

  const panel = (
    <div
      className={compact ? "space-y-3" : "rounded-2xl p-4 mb-4"}
      style={!compact ? {
        backgroundColor: "var(--layout-widget-bg, hsl(var(--card)))",
        color: "var(--layout-widget-text, hsl(var(--card-foreground)))",
        border: "1px solid color-mix(in srgb, var(--layout-border-color, hsl(var(--border))) 60%, transparent)",
      } : undefined}
    >
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, hsl(var(--primary))) 18%, transparent)" }}
          >
            <CalIcon size={18} style={{ color: "var(--layout-accent-color, hsl(var(--primary)))" }} />
          </div>
          <div>
            <h3 className="text-sm font-bold m-0">Google Agenda</h3>
            <p className="text-[11px] opacity-70 m-0">
              {loading ? "Verificando conexão..." : connected ? `${events.length} evento(s) sincronizado(s)` : "Conecte sua conta para ver os eventos aqui"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {connected ? (
            <>
              <Button size="sm" variant="outline" onClick={fetchEvents} disabled={refreshing} className="h-8 gap-1 text-xs rounded-full">
                {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Atualizar
              </Button>
              <Button size="sm" variant="outline" onClick={handleDisconnect} className="h-8 gap-1 text-xs rounded-full">
                <Unlink size={12} /> Desconectar
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={connecting}
              className="h-8 gap-1 text-xs rounded-full font-semibold"
              style={{ backgroundColor: "var(--layout-accent-color, hsl(var(--primary)))", color: "var(--layout-accent-text, hsl(var(--primary-foreground)))" }}
            >
              {connecting ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
              Conectar Google Agenda
            </Button>
          )}
        </div>
      </div>

      {connected && events.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
          {events.map((ev) => {
            const start = ev.start ? new Date(ev.start) : null;
            return (
              <a
                key={ev.id}
                href={ev.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl p-3 text-xs transition-transform hover:scale-[1.01]"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--layout-page-bg, hsl(var(--background))) 85%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--layout-border-color, hsl(var(--border))) 50%, transparent)",
                  color: "var(--layout-page-text, hsl(var(--foreground)))",
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-semibold line-clamp-2">{ev.summary}</span>
                  <ExternalLink size={11} className="opacity-50 shrink-0 mt-0.5" />
                </div>
                {start && <p className="text-[10px] opacity-70 m-0">{format(start, "dd 'de' MMM, HH:mm", { locale: ptBR })}</p>}
                {ev.location && <p className="text-[10px] opacity-60 m-0 mt-0.5 line-clamp-1">📍 {ev.location}</p>}
              </a>
            );
          })}
        </div>
      )}

      {connected && events.length === 0 && !refreshing && (
        <p className="text-[11px] opacity-60 text-center py-2 m-0">Nenhum evento próximo encontrado no seu Google Agenda.</p>
      )}
      <p className="text-[10px] opacity-60 m-0">O Google Agenda é somente leitura nesta integração; os eventos do Google não serão alterados ao limpar a agenda do House Mix.</p>
    </div>
  );

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="w-10 h-10 rounded-full bg-[#0055ff] hover:bg-[#0047e1] text-white transition-all shadow-sm flex items-center justify-center active:scale-95 cursor-pointer shrink-0"
          aria-label="Google Agenda"
          title="Google Agenda"
        >
          <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false">
            <path fill="white" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4.1 6v5h6.6c3.9-3.6 6.1-8.8 6.1-14.7zM24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2C9.2 39.5 16 44 24 44zM12.6 27.8c-.4-1.2-.7-2.5-.7-3.8s.2-2.6.7-3.8V15H5.8C4.4 17.7 3.6 20.8 3.6 24s.8 6.3 2.2 9l6.8-5.2zM24 11.8c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.8 29.5 4 24 4 16 4 9.2 8.5 5.8 15l6.8 5.2c1.6-4.8 6.1-8.4 11.4-8.4z"/>
          </svg>
        </button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl">
            <DialogHeader><DialogTitle>Google Agenda</DialogTitle></DialogHeader>
            {panel}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (loading) return null;
  return panel;
}
