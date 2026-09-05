import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border bg-white dark:bg-card">
        <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {React.cloneElement(icon as React.ReactElement, { size: 20 })}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-black text-foreground tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground font-medium">{subtitle}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-[#00BFF0]/10 text-[#00BFF0] border border-[#00BFF0]/20 uppercase tracking-wider">
            {count} REGISTROS
          </span>
        </div>
      </header>
      <div className="max-h-[52vh] overflow-y-auto bg-white dark:bg-card text-card-foreground">
        {children}
      </div>
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
    setLoading(true);
    // Buscamos um volume maior de músicas tocadas para ter uma base estatística real por cliente
    // E buscamos TODAS as curiosidades possíveis (aumentando o limite para cobrir a base histórica)
    const [tocadas, infos] = await Promise.all([
      supabase
        .from("musicas_tocadas")
        .select("id, user_id, dia, horario, artista, musica, programa, created_at")
        .order("created_at", { ascending: false })
        .limit(1000), // Aumentado de 100 para 1000 para estatísticas mais precisas
      supabase
        .from("infomusic")
        .select("id, user_id, artista, musica, curiosidade, created_at")
        .order("created_at", { ascending: false })
        .limit(5000), // Aumentado para 5000 para garantir que pegamos todo o histórico de curiosidades
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
            return [novo, ...prev].slice(0, 1000);
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
    const cadastradasGlobais = new Set(curiosidades.map((c) => key(c.artista, c.musica)));
    const seen = new Set<string>();
    const out: Row[] = [];
    
    rows.forEach((r) => {
      const k = `${r.user_id}::${key(r.artista, r.musica)}`;
      if (cadastradasGlobais.has(key(r.artista, r.musica)) || seen.has(k)) return;
      if (!norm(r.musica)) return;
      seen.add(k);
      out.push(r);
    });
    return out.filter((r) => matches([clientes[r.user_id], r.musica, r.artista]));
  }, [rows, curiosidades, q, clientes]);

  const hasCuriosidade = useCallback((artista: string | null, musica: string | null) => {
    return curiosidades.some(c => key(c.artista, c.musica) === key(artista, musica));
  }, [curiosidades]);

  const thClass = "px-4 py-3 font-black text-white dark:text-white";
  const headRow = "text-left text-[11px] uppercase tracking-wider bg-[#00BFF0]";
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
    <div className="max-w-[1400px] mx-auto w-full space-y-6 pt-2 pb-12 font-sans animate-fade-in">
      {/* Header Section (Card Branco Moderno) */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base md:text-lg font-black tracking-wider text-[#002132] uppercase leading-tight">
              Base de Dados — Info Music
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Músicas tocadas em todos os clientes com curiosidades cadastradas
              {lastUpdate ? ` · Sincronizado às ${lastUpdate.toLocaleTimeString("pt-BR")}` : ""}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar cliente, música ou artista..."
                className="h-11 pl-10 pr-4 w-[280px] rounded-full border border-slate-200/80 bg-[#f8fafc] text-xs font-semibold outline-none focus:bg-white focus:border-[#0055ff] transition-all"
              />
            </div>
            <button
              onClick={() => { setLoading(true); loadRows(); }}
              className="h-11 px-6 rounded-full bg-[#0055ff] hover:bg-[#0047d4] active:scale-95 text-white font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all cursor-pointer shadow-md hover:shadow-lg hover:shadow-blue-500/20"
            >
              <RefreshCw size={15} className={`text-black ${loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
          </div>
        </div>

        {/* Client stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(clientes).map(([userId, nome]) => {
            const com = curiosidades.filter(c => c.user_id === userId).length;
            const sem = semCuriosidade.filter(r => r.user_id === userId).length;
            
            if (com === 0 && sem === 0) return null;

            return (
              <div key={userId} className="bg-[#f8fafc] border border-slate-200/70 rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-xs font-black text-[#002132] truncate max-w-[140px]">{nome}</h3>
                  <div className="h-2 w-2 rounded-full bg-[#0055ff]" />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                    <p className="text-[9px] font-bold text-[#0055ff] uppercase mb-0.5">Com Curiosidade</p>
                    <p className="text-lg font-black text-[#002132] leading-none">{com}</p>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Sem Curiosidade</p>
                    <p className="text-lg font-black text-slate-600 leading-none">{sem}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <SectionCard
        icon={<Music size={16} />}
        title="Músicas tocadas"
        subtitle="Registro em tempo real de todos os clientes"
        count={filtered.length}
      >
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 shadow-sm">

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
            {filtered.slice(0, 100).map((r) => (
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
            className="h-9 px-4 rounded-full bg-[#0055ff] hover:bg-[#0047d4] text-white flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider transition-all shadow-sm active:scale-95"
          >
            <RefreshCw size={12} className="rotate-90 text-black" /> BAIXAR EXCEL (CSV)
          </button>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 shadow-sm">

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
          <thead className="sticky top-0 z-10 shadow-sm">
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
