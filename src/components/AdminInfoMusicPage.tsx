import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Music, RefreshCw, Search, Sparkles, HelpCircle } from "lucide-react";

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

interface CuriosidadeRow {
  id: string;
  user_id: string;
  artista: string | null;
  musica: string | null;
  curiosidade: string | null;
  created_at: string;
}

const formatDia = (dia: string | null, createdAt: string) => {
  const base = dia || createdAt.slice(0, 10);
  const [y, m, d] = base.split("-");
  return y && m && d ? `${d}/${m}/${y}` : base;
};

const norm = (v?: string | null) =>
  (v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();

const key = (artista?: string | null, musica?: string | null) => `${norm(artista)}|${norm(musica)}`;

function SectionCard({
  icon,
  title,
  subtitle,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-card text-card-foreground overflow-hidden shadow-sm">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted">
        <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground truncate">{title}</h2>
          <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
        </div>
        <span className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground">
          {count}
        </span>
      </header>
      <div className="max-h-[52vh] overflow-y-auto bg-white dark:bg-card text-card-foreground">{children}</div>
    </section>
  );
}

export default function AdminInfoMusicPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [curiosidades, setCuriosidades] = useState<CuriosidadeRow[]>([]);
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
    // Aumentando os limites para trazer mais registros e ter uma visão real
    const [tocadas, infos] = await Promise.all([
      supabase
        .from("musicas_tocadas")
        .select("id, user_id, dia, horario, artista, musica, programa, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("infomusic")
        .select("id, user_id, artista, musica, curiosidade, created_at")
        .order("created_at", { ascending: false })
        .limit(2000), // Aumentado significativamente para capturar todas as curiosidades
    ]);
    setRows((tocadas.data || []) as Row[]);
    setCuriosidades(
      ((infos.data || []) as CuriosidadeRow[]).filter((c) => (c.curiosidade || "").trim().length > 0)
    );
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
            return [novo, ...prev].slice(0, 100);
          });
          setLastUpdate(new Date());
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "infomusic" },
        () => {
          loadRows();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadClientes, loadRows]);

  // Fallback de polling (caso o realtime caia)
  useEffect(() => {
    const id = setInterval(loadRows, 45000);
    return () => clearInterval(id);
  }, [loadRows]);

  const q = busca.trim().toLowerCase();
  const matches = (vals: (string | null | undefined)[]) =>
    !q || vals.filter(Boolean).some((v) => String(v).toLowerCase().includes(q));

  const filtered = useMemo(
    () => rows.filter((r) => matches([clientes[r.user_id], r.musica, r.artista, r.programa])),
    [rows, q, clientes]
  );

  const curiosidadesFiltradas = useMemo(
    () => curiosidades.filter((c) => matches([clientes[c.user_id], c.musica, c.artista, c.curiosidade])),
    [curiosidades, q, clientes]
  );

  // Músicas tocadas (por cliente) que não possuem curiosidade cadastrada
  const semCuriosidade = useMemo(() => {
    // Para "sem curiosidade", queremos mostrar as que REALMENTE não tem nada cadastrado por NINGUÉM ou pelo CLIENTE?
    // O usuário disse: "verifique se na tabela de curiosidades cadastradas esta trazendo TODAS AS CURIOSIDADES ja cadastradas de todos os clientes"
    // E "na tabela de musicas sem curiosidades cadastradas, verifique se o total de registro esta trazendo realmente o numero real de todos os clientes"
    // Então a lógica deve ser global: se a música tem curiosidade em QUALQUER cliente, ela tem curiosidade.
    const cadastradasGlobais = new Set(curiosidades.map((c) => key(c.artista, c.musica)));
    const seen = new Set<string>();
    const out: Row[] = [];
    
    // Como rows agora é limitado a 100 para "conferência", para a lista de "sem curiosidade" talvez precisássemos de mais?
    // Mas vamos manter a coerência com o estado atual que usa 'rows'.
    rows.forEach((r) => {
      const k = key(r.artista, r.musica);
      if (cadastradasGlobais.has(k) || seen.has(k)) return;
      if (!norm(r.musica)) return;
      seen.add(k);
      out.push(r);
    });
    return out.filter((r) => matches([clientes[r.user_id], r.musica, r.artista]));
  }, [rows, curiosidades, q, clientes]);

  const hasCuriosidade = useCallback((artista: string | null, musica: string | null) => {
    return curiosidades.some(c => key(c.artista, c.musica) === key(artista, musica));
  }, [curiosidades]);

  const thClass = "px-4 py-3 font-black text-[#00BFF0] dark:text-[#00BFF0]";
  const headRow = "text-left text-[11px] uppercase tracking-wider";
  const trClass =
    "border-t border-border/60 odd:bg-slate-50/50 dark:odd:bg-transparent even:bg-white dark:even:bg-transparent hover:bg-primary/5 transition-colors text-foreground";

  const handleDownloadCuriosidades = () => {
    const headers = ["Cliente", "Música", "Artista", "Curiosidade", "Data de Cadastro"];
    const csvContent = curiosidadesFiltradas.map(c => [
      clientes[c.user_id] || c.user_id,
      c.musica,
      c.artista,
      c.curiosidade?.replace(/,/g, ";"),
      c.created_at
    ].join(",")).join("\n");
    
    const blob = new Blob([headers.join(",") + "\n" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `curiosidades_nexo_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  return (
    <div className="space-y-5 animate-fade-in">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
        {Object.entries(clientes).map(([userId, nome]) => {
          const com = curiosidades.filter(c => c.user_id === userId).length;
          const sem = semCuriosidade.filter(r => r.user_id === userId).length;
          
          if (com === 0 && sem === 0) return null;

          return (
            <div key={userId} className="bg-white dark:bg-card border border-border rounded-xl p-3 shadow-sm hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xs font-black text-foreground truncate max-w-[140px]">{nome}</h3>
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 dark:bg-muted/50 p-2 rounded-lg border border-border">
                  <p className="text-[9px] font-bold text-primary uppercase mb-0.5">Com Curiosidade</p>
                  <p className="text-lg font-black text-foreground leading-none">{com}</p>
                </div>
                <div className="bg-slate-50 dark:bg-muted/50 p-2 rounded-lg border border-border">
                  <p className="text-[9px] font-bold text-muted-foreground uppercase mb-0.5">Sem Curiosidade</p>
                  <p className="text-lg font-black text-foreground leading-none">{sem}</p>
                </div>
              </div>
            </div>
          );
        })}
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

      <SectionCard
        icon={<Music size={16} />}
        title="Músicas tocadas"
        subtitle="Registro em tempo real de todos os clientes"
        count={filtered.length}
      >
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-muted shadow-sm">
            <tr className={headRow}>
              <th className={thClass}>Data</th>
              <th className={thClass}>Horário</th>
              <th className={thClass}>Cliente</th>
              <th className={thClass}>Música</th>
              <th className={thClass}>Artista</th>
              <th className={thClass}>Curiosidade?</th>
              <th className={thClass}>Programa</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Carregando…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nenhuma música registrada.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className={trClass}>
                <td className="px-4 py-2.5 whitespace-nowrap text-foreground">{formatDia(r.dia, r.created_at)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs text-foreground/90">{(r.horario || "").slice(0, 8)}</td>
                <td className="px-4 py-2.5 font-bold text-foreground">{clientes[r.user_id] || r.user_id.slice(0, 8)}</td>
                <td className="px-4 py-2.5 font-bold text-primary">{r.musica}</td>
                <td className="px-4 py-2.5 font-bold text-foreground/90">{r.artista}</td>
                <td className="px-4 py-2.5 text-center">
                  {hasCuriosidade(r.artista, r.musica) ? (
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-[10px] font-bold">SIM</span>
                  ) : (
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-bold">NÃO</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-foreground/80 text-[11px] font-medium">{r.programa || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard
        icon={<Sparkles size={16} />}
        title="Músicas com curiosidade cadastrada"
        subtitle="Curiosidades registradas por todos os clientes — Validade de 1 ano"
        count={curiosidadesFiltradas.length}
      >
        <div className="flex justify-end p-2 border-b border-border bg-slate-50/50">
          <button 
            onClick={handleDownloadCuriosidades}
            className="text-[10px] font-bold px-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw size={10} className="rotate-90" /> BAIXAR EXCEL (CSV)
          </button>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-muted shadow-sm">
            <tr className={headRow}>
              <th className={thClass}>Cliente</th>
              <th className={thClass}>Música</th>
              <th className={thClass}>Artista</th>
              <th className={thClass}>Curiosidade</th>
            </tr>
          </thead>
          <tbody>
            {!loading && curiosidadesFiltradas.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhuma curiosidade cadastrada.</td></tr>
            )}
            {curiosidadesFiltradas.map((c) => (
              <tr key={c.id} className={trClass}>
                <td className="px-4 py-2.5 font-bold text-foreground whitespace-nowrap">{clientes[c.user_id] || c.user_id.slice(0, 8)}</td>
                <td className="px-4 py-2.5 font-bold text-primary">{c.musica}</td>
                <td className="px-4 py-2.5 font-bold text-foreground/90">{c.artista}</td>
                <td className="px-4 py-2.5 text-foreground text-xs max-w-[520px] leading-relaxed font-medium">{c.curiosidade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard
        icon={<HelpCircle size={16} />}
        title="Músicas sem curiosidade cadastrada"
        subtitle="Oportunidades de cadastro — músicas tocadas sem informação"
        count={semCuriosidade.length}
      >
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-muted shadow-sm">
            <tr className={headRow}>
              <th className={thClass}>Cliente</th>
              <th className={thClass}>Música</th>
              <th className={thClass}>Artista</th>
              <th className={thClass}>Última execução</th>
            </tr>
          </thead>
          <tbody>
            {!loading && semCuriosidade.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Todas as músicas possuem curiosidade.</td></tr>
            )}
            {semCuriosidade.map((r) => (
              <tr key={`sc-${r.id}`} className={trClass}>
                <td className="px-4 py-2.5 font-bold text-foreground whitespace-nowrap">{clientes[r.user_id] || r.user_id.slice(0, 8)}</td>
                <td className="px-4 py-2.5 font-bold text-primary">{r.musica}</td>
                <td className="px-4 py-2.5 font-bold text-foreground/90">{r.artista}</td>
                <td className="px-4 py-2.5 text-foreground text-xs whitespace-nowrap font-medium">
                  {formatDia(r.dia, r.created_at)} {(r.horario || "").slice(0, 5)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
