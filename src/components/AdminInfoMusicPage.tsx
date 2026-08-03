import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Music, RefreshCw, Search } from "lucide-react";

interface Row {
  id: string;
  user_id: string;
  dia: string | null;
  horario: string | null;
  artista: string | null;
  musica: string | null;
  programa: string | null;
  created_at: string;
}

const formatDia = (dia: string | null, createdAt: string) => {
  const base = dia || createdAt.slice(0, 10);
  const [y, m, d] = base.split("-");
  return y && m && d ? `${d}/${m}/${y}` : base;
};

export default function AdminInfoMusicPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [clientes, setClientes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const clientesRef = useRef<Record<string, string>>({});

  const loadClientes = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("user_id, nome, email");
    const map: Record<string, string> = {};
    (data || []).forEach((p: any) => {
      map[p.user_id] = p.nome || p.email || p.user_id.slice(0, 8);
    });
    clientesRef.current = map;
    setClientes(map);
  }, []);

  const loadRows = useCallback(async () => {
    const { data } = await supabase
      .from("musicas_tocadas")
      .select("id, user_id, dia, horario, artista, musica, programa, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    setRows((data || []) as Row[]);
    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadClientes();
    loadRows();
  }, [loadClientes, loadRows]);

  // Atualização em tempo real: qualquer música registrada por qualquer cliente
  useEffect(() => {
    const channel = supabase
      .channel("admin-info-music")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "musicas_tocadas" },
        (payload) => {
          const novo = payload.new as Row;
          if (!clientesRef.current[novo.user_id]) loadClientes();
          setRows((prev) => {
            if (prev.some((r) => r.id === novo.id)) return prev;
            return [novo, ...prev].slice(0, 300);
          });
          setLastUpdate(new Date());
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadClientes]);

  // Fallback de polling (caso o realtime caia)
  useEffect(() => {
    const id = setInterval(loadRows, 45000);
    return () => clearInterval(id);
  }, [loadRows]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [clientes[r.user_id], r.musica, r.artista, r.programa]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, busca, clientes]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Music className="text-primary" size={20} />
          <div>
            <h1 className="text-lg font-bold text-foreground">Info Music</h1>
            <p className="text-xs text-muted-foreground">
              Músicas tocadas em todos os clientes — atualização em tempo real
              {lastUpdate ? ` · ${lastUpdate.toLocaleTimeString("pt-BR")}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente, música ou artista"
              className="pl-9 w-[280px]"
            />
          </div>
          <button
            onClick={() => { setLoading(true); loadRows(); }}
            className="h-10 px-3 rounded-full bg-secondary text-secondary-foreground flex items-center gap-2 text-xs font-semibold"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Atualizar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Horário</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Música</th>
                <th className="px-4 py-3">Artista</th>
                <th className="px-4 py-3">Programa</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Carregando…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhuma música registrada.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border/60 hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDia(r.dia, r.created_at)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs">{(r.horario || "").slice(0, 8)}</td>
                  <td className="px-4 py-2.5 font-semibold">{clientes[r.user_id] || r.user_id.slice(0, 8)}</td>
                  <td className="px-4 py-2.5">{r.musica}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.artista}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{r.programa || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
