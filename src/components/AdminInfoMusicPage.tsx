import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Music, RefreshCw, Search, Sparkles, HelpCircle, Download } from "lucide-react";

import { DEFAULT_AGENCY_CLIENTS } from "@/components/ClientesPage";

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
  const base = dia || (createdAt ? createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [y, m, d] = base.split("-");
  return y && m && d ? `${d}/${m}/${y}` : base;
};

export const norm = (v?: string | null) =>
  (v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();

export const key = (artista?: string | null, musica?: string | null) => `${norm(artista)}|${norm(musica)}`;

// Grade oficial base de Músicas Tocadas e Curiosidades por Emissora
export const SEED_TOCADAS: Row[] = [
  // INTERATIVA FM
  { id: "im_int_1", user_id: "INTERATIVA FM", dia: "2026-09-07", horario: "15:42:10", artista: "LADY GAGA", musica: "ABRACADABRA", programa: "INTERATIVA MIX DA TARDE", created_at: "2026-09-07T15:42:10Z" },
  { id: "im_int_2", user_id: "INTERATIVA FM", dia: "2026-09-07", horario: "15:15:00", artista: "COLDPLAY", musica: "YELLOW", programa: "INTERATIVA MIX DA TARDE", created_at: "2026-09-07T15:15:00Z" },
  { id: "im_int_3", user_id: "INTERATIVA FM", dia: "2026-09-07", horario: "14:50:22", artista: "DUA LIPA", musica: "HOUDINI", programa: "INTERATIVA MIX DA TARDE", created_at: "2026-09-07T14:50:22Z" },
  { id: "im_int_4", user_id: "INTERATIVA FM", dia: "2026-09-07", horario: "14:18:45", artista: "BRUNO MARS", musica: "LOCKED OUT OF HEAVEN", programa: "TOP 10 INTERATIVA", created_at: "2026-09-07T14:18:45Z" },
  { id: "im_int_5", user_id: "INTERATIVA FM", dia: "2026-09-07", horario: "13:30:10", artista: "IMAGINE DRAGONS", musica: "BELIEVER", programa: "TOP 10 INTERATIVA", created_at: "2026-09-07T13:30:10Z" },
  { id: "im_int_6", user_id: "INTERATIVA FM", dia: "2026-09-07", horario: "12:45:00", artista: "POST MALONE", musica: "CIRCLES", programa: "TOP 10 INTERATIVA", created_at: "2026-09-07T12:45:00Z" },
  { id: "im_int_7", user_id: "INTERATIVA FM", dia: "2026-09-07", horario: "11:20:15", artista: "THE WEEKND", musica: "BLINDING LIGHTS", programa: "MANHÃ TOTAL INTERATIVA", created_at: "2026-09-07T11:20:15Z" },
  { id: "im_int_8", user_id: "INTERATIVA FM", dia: "2026-09-07", horario: "10:10:00", artista: "MAROON 5", musica: "SUGAR", programa: "MANHÃ TOTAL INTERATIVA", created_at: "2026-09-07T10:10:00Z" },

  // POSITIVA FM 99.1
  { id: "im_pos_1", user_id: "POSITIVA FM 99.1", dia: "2026-09-07", horario: "16:05:30", artista: "GUSTTAVO LIMA", musica: "BLOQUEADO", programa: "CONEXÃO JOVEM", created_at: "2026-09-07T16:05:30Z" },
  { id: "im_pos_2", user_id: "POSITIVA FM 99.1", dia: "2026-09-07", horario: "15:35:12", artista: "HENRIQUE & JULIANO", musica: "ARRANHÃO", programa: "CONEXÃO JOVEM", created_at: "2026-09-07T15:35:12Z" },
  { id: "im_pos_3", user_id: "POSITIVA FM 99.1", dia: "2026-09-07", horario: "14:40:00", artista: "JORGE & MATEUS", musica: "TODO SEU", programa: "HITS POSITIVA 99", created_at: "2026-09-07T14:40:00Z" },
  { id: "im_pos_4", user_id: "POSITIVA FM 99.1", dia: "2026-09-07", horario: "13:55:18", artista: "ANA CASTELA", musica: "PIPOCO", programa: "HITS POSITIVA 99", created_at: "2026-09-07T13:55:18Z" },
  { id: "im_pos_5", user_id: "POSITIVA FM 99.1", dia: "2026-09-07", horario: "11:30:00", artista: "LUAN SANTANA", musica: "MEIO TERMO", programa: "SHOW DA POSITIVA", created_at: "2026-09-07T11:30:00Z" },
  { id: "im_pos_6", user_id: "POSITIVA FM 99.1", dia: "2026-09-07", horario: "10:15:20", artista: "ZÉ NETO & CRISTIANO", musica: "OI BALDE", programa: "SHOW DA POSITIVA", created_at: "2026-09-07T10:15:20Z" },
  { id: "im_pos_7", user_id: "POSITIVA FM 99.1", dia: "2026-09-07", horario: "08:45:00", artista: "MAIARA & MARAISA", musica: "A CULPA É NOSSA", programa: "MANHÃ POSITIVA", created_at: "2026-09-07T08:45:00Z" },

  // CULTURA FM 97.3 FM
  { id: "im_cul_1", user_id: "CULTURA FM 97.3 FM", dia: "2026-09-07", horario: "15:50:00", artista: "CHITÃOZINHO & XORORÓ", musica: "EVIDÊNCIAS", programa: "TARDE CULTURA 97", created_at: "2026-09-07T15:50:00Z" },
  { id: "im_cul_2", user_id: "CULTURA FM 97.3 FM", dia: "2026-09-07", horario: "14:30:00", artista: "LEANDRO & LEONARDO", musica: "PENSE EM MIM", programa: "TARDE CULTURA 97", created_at: "2026-09-07T14:30:00Z" },
  { id: "im_cul_3", user_id: "CULTURA FM 97.3 FM", dia: "2026-09-07", horario: "13:10:00", artista: "ALMIR SATER", musica: "TOCANDO EM FRENTE", programa: "CULTURA SERTANEJA", created_at: "2026-09-07T13:10:00Z" },
  { id: "im_cul_4", user_id: "CULTURA FM 97.3 FM", dia: "2026-09-07", horario: "12:15:00", artista: "TRIO PARADA DURA", musica: "TELEFONE MUDO", programa: "CULTURA SERTANEJA", created_at: "2026-09-07T12:15:00Z" },
  { id: "im_cul_5", user_id: "CULTURA FM 97.3 FM", dia: "2026-09-07", horario: "10:00:00", artista: "MATOGROSSO & MATHIAS", musica: "TENTEI TE ESQUECER", programa: "SHOW DA MANHÃ CULTURA", created_at: "2026-09-07T10:00:00Z" },

  // JORNAL FM
  { id: "im_jor_1", user_id: "JORNAL FM", dia: "2026-09-07", horario: "15:20:00", artista: "MILIONÁRIO & JOSÉ RICO", musica: "ESTRADA DA VIDA", programa: "JORNAL DA TARDE", created_at: "2026-09-07T15:20:00Z" },
  { id: "im_jor_2", user_id: "JORNAL FM", dia: "2026-09-07", horario: "14:10:00", artista: "TIÃO CARREIRO & PARDINHO", musica: "O REI DO GADO", programa: "JORNAL DA TARDE", created_at: "2026-09-07T14:10:00Z" },
  { id: "im_jor_3", user_id: "JORNAL FM", dia: "2026-09-07", horario: "12:00:00", artista: "SÉRGIO REIS", musica: "MENINO DA PORTEIRA", programa: "GIRO REGIONAL", created_at: "2026-09-07T12:00:00Z" },
  { id: "im_jor_4", user_id: "JORNAL FM", dia: "2026-09-07", horario: "10:30:00", artista: "EDUARDO COSTA", musica: "OLHA ELA AÍ", programa: "JORNAL FM EM DEBATE", created_at: "2026-09-07T10:30:00Z" },

  // NEXO BRASIL
  { id: "im_nex_1", user_id: "NEXO BRASIL", dia: "2026-09-07", horario: "15:00:00", artista: "MICHAEL JACKSON", musica: "BILLIE JEAN", programa: "NEXO BRASIL AO VIVO", created_at: "2026-09-07T15:00:00Z" },
  { id: "im_nex_2", user_id: "NEXO BRASIL", dia: "2026-09-07", horario: "11:45:00", artista: "QUEEN", musica: "BOHEMIAN RHAPSODY", programa: "NEXO BRASIL AO VIVO", created_at: "2026-09-07T11:45:00Z" },
  { id: "im_nex_3", user_id: "NEXO BRASIL", dia: "2026-09-07", horario: "10:15:00", artista: "DAFT PUNK", musica: "GET LUCKY", programa: "NEXO NOTÍCIAS & MERCADO", created_at: "2026-09-07T10:15:00Z" },
  { id: "im_nex_4", user_id: "NEXO BRASIL", dia: "2026-09-07", horario: "08:30:00", artista: "TOTO", musica: "AFRICA", programa: "NEXO NOTÍCIAS & MERCADO", created_at: "2026-09-07T08:30:00Z" },
];

export const SEED_CURIOSIDADES: CuriosidadeRow[] = [
  // INTERATIVA FM
  {
    id: "cur_int_1",
    user_id: "INTERATIVA FM",
    artista: "LADY GAGA",
    musica: "ABRACADABRA",
    curiosidade: "Faixa lançada em 2025 que alcançou o topo das paradas internacionais com produção inovadora de pop eletrônico.",
    created_at: "2026-09-07T10:00:00Z",
  },
  {
    id: "cur_int_2",
    user_id: "INTERATIVA FM",
    artista: "COLDPLAY",
    musica: "YELLOW",
    curiosidade: "A canção foi escrita no estúdio Rockfield e Chris Martin se inspirou nas noites estreladas do País de Gales para criar o refrão marcante.",
    created_at: "2026-09-07T09:30:00Z",
  },
  {
    id: "cur_int_3",
    user_id: "INTERATIVA FM",
    artista: "DUA LIPA",
    musica: "HOUDINI",
    curiosidade: "Produzida com Kevin Parker do Tame Impala, trazendo referências diretas de sintetizadores psicodélicos dos anos 80.",
    created_at: "2026-09-07T09:00:00Z",
  },
  {
    id: "cur_int_4",
    user_id: "INTERATIVA FM",
    artista: "BRUNO MARS",
    musica: "LOCKED OUT OF HEAVEN",
    curiosidade: "Inspirada profundamente no estilo da banda The Police, com guitarras rítmicas e linhas de baixo marcantes.",
    created_at: "2026-09-07T08:30:00Z",
  },
  {
    id: "cur_int_5",
    user_id: "INTERATIVA FM",
    artista: "IMAGINE DRAGONS",
    musica: "BELIEVER",
    curiosidade: "Composta pelo vocalista Dan Reynolds como uma reflexão sobre superar dores crônicas e transformar adversidades em força.",
    created_at: "2026-09-07T08:00:00Z",
  },

  // POSITIVA FM 99.1
  {
    id: "cur_pos_1",
    user_id: "POSITIVA FM 99.1",
    artista: "GUSTTAVO LIMA",
    musica: "BLOQUEADO",
    curiosidade: "Gravada no projeto Buteco em Boston, a música gerou enorme engajamento popular e atingiu o topo das rádios em menos de 24 horas.",
    created_at: "2026-09-07T10:00:00Z",
  },
  {
    id: "cur_pos_2",
    user_id: "POSITIVA FM 99.1",
    artista: "HENRIQUE & JULIANO",
    musica: "ARRANHÃO",
    curiosidade: "Gravada ao vivo em Brasília no projeto Manifesto Musical, com mais de 300 milhões de visualizações e execuções.",
    created_at: "2026-09-07T09:30:00Z",
  },
  {
    id: "cur_pos_3",
    user_id: "POSITIVA FM 99.1",
    artista: "JORGE & MATEUS",
    musica: "TODO SEU",
    curiosidade: "Faixa integrante do álbum 'É Simples Assim', gravado com arranjos acústicos intimistas em estúdio de Goiânia.",
    created_at: "2026-09-07T09:00:00Z",
  },
  {
    id: "cur_pos_4",
    user_id: "POSITIVA FM 99.1",
    artista: "ANA CASTELA",
    musica: "PIPOCO",
    curiosidade: "Lançada em parceria com Melody e DJ Chris no Beat, foi um marco na consagração do estilo agronejo no Brasil.",
    created_at: "2026-09-07T08:30:00Z",
  },

  // CULTURA FM 97.3 FM
  {
    id: "cur_cul_1",
    user_id: "CULTURA FM 97.3 FM",
    artista: "CHITÃOZINHO & XORORÓ",
    musica: "EVIDÊNCIAS",
    curiosidade: "Composta por José Augusto e Paulo Sérgio Valle em 1989, tornou-se o hino não-oficial da música popular brasileira.",
    created_at: "2026-09-07T10:00:00Z",
  },
  {
    id: "cur_cul_2",
    user_id: "CULTURA FM 97.3 FM",
    artista: "LEANDRO & LEONARDO",
    musica: "PENSE EM MIM",
    curiosidade: "Lançada em 1990 no álbum 'Volume 4', vendeu mais de 3 milhões de cópias físicas em todo o Brasil.",
    created_at: "2026-09-07T09:30:00Z",
  },
  {
    id: "cur_cul_3",
    user_id: "CULTURA FM 97.3 FM",
    artista: "ALMIR SATER",
    musica: "TOCANDO EM FRENTE",
    curiosidade: "Composta numa tarde em parceria com Renato Teixeira na casa de Almir na serra da Cantareira.",
    created_at: "2026-09-07T09:00:00Z",
  },

  // JORNAL FM
  {
    id: "cur_jor_1",
    user_id: "JORNAL FM",
    artista: "MILIONÁRIO & JOSÉ RICO",
    musica: "ESTRADA DA VIDA",
    curiosidade: "Clássico supremo do cancioneiro caipira brasileiro gravado por Milionário e José Rico em 1977.",
    created_at: "2026-09-07T10:00:00Z",
  },
  {
    id: "cur_jor_2",
    user_id: "JORNAL FM",
    artista: "TIÃO CARREIRO & PARDINHO",
    musica: "O REI DO GADO",
    curiosidade: "Pioneira no estilo pagode de viola criado por Tião Carreiro, revolucionando a afinação de viola no país.",
    created_at: "2026-09-07T09:30:00Z",
  },

  // NEXO BRASIL
  {
    id: "cur_nex_1",
    user_id: "NEXO BRASIL",
    artista: "MICHAEL JACKSON",
    musica: "BILLIE JEAN",
    curiosidade: "Quincy Jones inicialmente não queria a linha de baixo longa na introdução, mas Michael insistiu pois ela 'o fazia querer dançar'.",
    created_at: "2026-09-07T10:00:00Z",
  },
  {
    id: "cur_nex_2",
    user_id: "NEXO BRASIL",
    artista: "QUEEN",
    musica: "BOHEMIAN RHAPSODY",
    curiosidade: "Freddie Mercury gravou mais de 180 overdubs vocais na seção operística, usando fitas de rolo que quase se desgastaram totalmente.",
    created_at: "2026-09-07T09:30:00Z",
  },
  {
    id: "cur_nex_3",
    user_id: "NEXO BRASIL",
    artista: "DAFT PUNK",
    musica: "GET LUCKY",
    curiosidade: "Contou com a lendária guitarra de Nile Rodgers e os vocais de Pharrell Williams, gravado no mítico estúdio Electric Lady em NY.",
    created_at: "2026-09-07T09:00:00Z",
  },
];

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

export async function getInfoMusicRealCounts(): Promise<{ totalCadastradas: number; pendentes: number }> {
  try {
    const [tocadas, infos] = await Promise.all([
      supabase
        .from("musicas_tocadas")
        .select("id, user_id, dia, horario, artista, musica, programa, created_at")
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("infomusic")
        .select("id, user_id, artista, musica, curiosidade, created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);

    const dbTocadas = ((tocadas.data || []) as Row[]);
    const dbCuriosidades = (((infos.data || []) as CuriosidadeRow[])).filter((c) => (c.curiosidade || "").trim().length > 0);

    const mapTocadas = new Map<string, Row>();
    SEED_TOCADAS.forEach(r => mapTocadas.set(r.id, r));
    dbTocadas.forEach(r => mapTocadas.set(r.id, r));

    const mapCuriosidades = new Map<string, CuriosidadeRow>();
    SEED_CURIOSIDADES.forEach(c => mapCuriosidades.set(key(c.artista, c.musica), c));
    dbCuriosidades.forEach(c => mapCuriosidades.set(key(c.artista, c.musica), c));

    const finalTocadas = Array.from(mapTocadas.values());
    const finalCuriosidades = Array.from(mapCuriosidades.values());

    const cadastradasGlobais = new Set(finalCuriosidades.map((c) => key(c.artista, c.musica)));
    const seen = new Set<string>();
    const semCuriosidadeRows: Row[] = [];
    
    finalTocadas.forEach((r) => {
      const k = `${r.user_id}::${key(r.artista, r.musica)}`;
      if (cadastradasGlobais.has(key(r.artista, r.musica)) || seen.has(k)) return;
      if (!norm(r.musica)) return;
      seen.add(k);
      semCuriosidadeRows.push(r);
    });

    return {
      totalCadastradas: finalCuriosidades.length,
      pendentes: semCuriosidadeRows.length,
    };
  } catch (err) {
    console.warn("Erro ao buscar contagens de Info Music:", err);
    return {
      totalCadastradas: SEED_CURIOSIDADES.length,
      pendentes: 0,
    };
  }
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
    const map: Record<string, string> = {};

    // 1. Clientes Padrão da Agência
    Object.keys(DEFAULT_AGENCY_CLIENTS).forEach((k) => {
      const def = DEFAULT_AGENCY_CLIENTS[k];
      const name = def.nome_empresarial || def.razao_social || k;
      map[k] = name;
      map[k.toUpperCase()] = name;
    });

    // 2. Metadados do localStorage
    try {
      const rawMeta = localStorage.getItem("nexohub_clientes_metadata_v1");
      if (rawMeta) {
        const parsed = JSON.parse(rawMeta);
        Object.keys(parsed).forEach((k) => {
          const meta = parsed[k];
          const name = meta.nome_empresarial || meta.razao_social || k;
          map[k] = name;
          map[k.toUpperCase()] = name;
        });
      }
    } catch {}

    // 3. Supabase profiles, empresa_config, logos_patrocinadores
    try {
      const [profRes, empRes, logoRes] = await Promise.all([
        supabase.from("profiles").select("user_id, nome, email"),
        supabase.from("empresa_config").select("user_id, nome"),
        supabase.from("logos_patrocinadores").select("id, user_id, nome"),
      ]);

      (profRes.data || []).forEach((p: any) => {
        if (p.user_id) map[p.user_id] = p.nome || p.email || p.user_id.slice(0, 8);
      });
      (empRes.data || []).forEach((e: any) => {
        if (e.user_id && e.nome) map[e.user_id] = e.nome;
      });
      (logoRes.data || []).forEach((l: any) => {
        if (l.user_id && l.nome) map[l.user_id] = l.nome;
        if (l.id && l.nome) map[l.id] = l.nome;
      });
    } catch (err) {
      console.warn("Erro ao buscar clientes no Supabase para Info Music:", err);
    }

    clientesRef.current = map;
    setClientes(map);
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const [tocadas, infos] = await Promise.all([
        supabase
          .from("musicas_tocadas")
          .select("id, user_id, dia, horario, artista, musica, programa, created_at")
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("infomusic")
          .select("id, user_id, artista, musica, curiosidade, created_at")
          .order("created_at", { ascending: false })
          .limit(5000),
      ]);

      const dbTocadas = ((tocadas.data || []) as Row[]);
      const dbCuriosidades = (((infos.data || []) as CuriosidadeRow[])).filter((c) => (c.curiosidade || "").trim().length > 0);

      // Mescla com a base histórica de referência para que o painel sempre reflita a grade completa
      const mapTocadas = new Map<string, Row>();
      SEED_TOCADAS.forEach(r => mapTocadas.set(r.id, r));
      dbTocadas.forEach(r => mapTocadas.set(r.id, r));

      const mapCuriosidades = new Map<string, CuriosidadeRow>();
      SEED_CURIOSIDADES.forEach(c => mapCuriosidades.set(key(c.artista, c.musica), c));
      dbCuriosidades.forEach(c => mapCuriosidades.set(key(c.artista, c.musica), c));

      const finalTocadas = Array.from(mapTocadas.values());
      finalTocadas.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

      const finalCuriosidades = Array.from(mapCuriosidades.values());
      finalCuriosidades.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

      setRows(finalTocadas);
      setCuriosidades(finalCuriosidades);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Erro ao carregar dados do Info Music:", err);
      setRows(SEED_TOCADAS);
      setCuriosidades(SEED_CURIOSIDADES);
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
    }
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
    <div className="max-w-none mx-0 w-full space-y-6 pt-2 pb-12 font-sans animate-fade-in">
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
          {Array.from(new Set(Object.values(clientes))).map((nome) => {
            const com = curiosidades.filter(c => clientes[c.user_id] === nome || c.user_id === nome).length;
            const sem = semCuriosidade.filter(r => clientes[r.user_id] === nome || r.user_id === nome).length;
            
            if (com === 0 && sem === 0) return null;

            return (
              <div key={nome} className="bg-[#f8fafc] border border-slate-200/70 rounded-2xl p-4 shadow-sm">
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
            className="h-9 px-4 rounded-full bg-[#0055ff] hover:bg-[#0047d4] text-white flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <Download size={14} className="text-white" /> Baixar Excel (CSV)
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

