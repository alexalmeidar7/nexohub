import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, Users, Radio, MonitorPlay, Layers, CheckCircle2, XCircle,
  Music, Search, Sparkles,
} from "lucide-react";


interface Empresa {
  user_id: string;
  nome: string | null;
  logo: string | null;
  plano: string | null;
  ativo: boolean;
  instagram_subs: number | null;
  youtube_subs: number | null;
  facebook_subs: number | null;
}

interface Canal {
  id: string;
  user_id: string;
  name: string;
  url: string;
  type: string;
  active: boolean;
  logo_url: string | null;
  cover_url: string | null;
}

interface ClienteRow {
  user_id: string;
  nome: string;
  email: string;
  logo: string | null;
  plano: string | null;
  ativo: boolean;
  subUsers: number;
  modules: number;
  canaisVideo: Canal[];
  canaisAudio: number;
  canaisCatalogo: number;
  social: number;
}

const isVideo = (t?: string | null) => (t || "").toLowerCase().startsWith("video");
const isAudio = (t?: string | null) => (t || "").toLowerCase().startsWith("audio");
const isCatalog = (t?: string | null) => (t || "").toLowerCase().includes("catalog");

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-none">{value}</div>
        <div className="text-[10px] text-muted-foreground truncate">{label}</div>
      </div>
    </div>
  );
}

export default function AdminClientsDashboard() {
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [busca, setBusca] = useState("");
  const [somenteAtivos, setSomenteAtivos] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [empRes, profRes, subRes, cmRes, chanRes] = await Promise.all([
          supabase.from("empresa_config")
            .select("user_id, nome, logo, plano, ativo, instagram_subs, youtube_subs, facebook_subs")
            .order("nome"),
          supabase.from("profiles").select("user_id, email"),
          supabase.from("sub_users").select("parent_user_id, ativo"),
          supabase.from("client_modules").select("user_id, enabled"),
          supabase.from("streaming_channels")
            .select("id, user_id, name, url, type, active, logo_url, cover_url"),
        ]);

        const empresas = (empRes.data as Empresa[]) || [];
        const emails = new Map<string, string>();
        (profRes.data || []).forEach((p: any) => emails.set(p.user_id, p.email || ""));

        const subCount = new Map<string, number>();
        (subRes.data || []).forEach((s: any) => {
          if (s.ativo === false) return;
          subCount.set(s.parent_user_id, (subCount.get(s.parent_user_id) || 0) + 1);
        });

        const modCount = new Map<string, number>();
        (cmRes.data || []).forEach((m: any) => {
          if (!m.enabled) return;
          modCount.set(m.user_id, (modCount.get(m.user_id) || 0) + 1);
        });

        const canais = (chanRes.data as Canal[]) || [];

        const rows: ClienteRow[] = empresas.map(e => {
          const meus = canais.filter(c => c.user_id === e.user_id);
          return {
            user_id: e.user_id,
            nome: e.nome || emails.get(e.user_id) || "Sem nome",
            email: emails.get(e.user_id) || "",
            logo: e.logo,
            plano: e.plano,
            ativo: !!e.ativo,
            subUsers: subCount.get(e.user_id) || 0,
            modules: modCount.get(e.user_id) || 0,
            canaisVideo: meus.filter(c => isVideo(c.type) && c.active),
            canaisAudio: meus.filter(c => isAudio(c.type) && c.active).length,
            canaisCatalogo: meus.filter(c => isCatalog(c.type) && c.active).length,
            social: (e.instagram_subs || 0) + (e.youtube_subs || 0) + (e.facebook_subs || 0),
          };
        });

        setClientes(rows);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return clientes.filter(c => {
      if (somenteAtivos && !c.ativo) return false;
      if (!q) return true;
      return c.nome.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (c.plano || "").toLowerCase().includes(q);
    });
  }, [clientes, busca, somenteAtivos]);

  const totais = useMemo(() => ({
    clientes: clientes.length,
    ativos: clientes.filter(c => c.ativo).length,
    video: clientes.reduce((a, c) => a + c.canaisVideo.length, 0),
    audio: clientes.reduce((a, c) => a + c.canaisAudio, 0),
    subs: clientes.reduce((a, c) => a + c.subUsers, 0),
  }), [clientes]);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Painel Super Admin
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Visão geral de todos os clientes, pacotes e canais
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar cliente..."
              className="h-9 pl-8 pr-3 text-sm rounded-full bg-muted/50 border border-border/60 outline-none focus:border-primary/60 w-52"
            />
          </div>
          <button
            onClick={() => setSomenteAtivos(v => !v)}
            className={`h-9 px-3 text-xs rounded-full border transition ${somenteAtivos ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 border-border/60 text-muted-foreground"}`}
          >
            Somente ativos
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={Building2} label="clientes" value={totais.clientes} />
        <Stat icon={CheckCircle2} label="ativos" value={totais.ativos} />
        <Stat icon={MonitorPlay} label="canais de vídeo" value={totais.video} />
        <Stat icon={Radio} label="canais de áudio" value={totais.audio} />
        <Stat icon={Users} label="subusuários" value={totais.subs} />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/60 bg-card p-4 animate-pulse space-y-3">
              <div className="h-4 w-1/2 bg-muted rounded" />
              <div className="h-10 bg-muted rounded-lg" />
              <div className="h-8 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhum cliente encontrado.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {filtrados.map(c => (
            <div key={c.user_id} className="rounded-2xl border border-border/60 bg-card p-4 flex flex-col gap-3 hover:border-primary/40 hover:shadow-sm transition">
              <div className="flex items-center gap-3">
                {c.logo ? (
                  <img src={c.logo} alt={c.nome} className="w-10 h-10 rounded-lg object-contain bg-muted/50" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{c.nome}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{c.email}</div>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${c.ativo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {c.ativo ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {c.ativo ? "ativo" : "inativo"}
                </span>
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold leading-none truncate">{c.plano || "—"}</div>
                  <div className="text-[10px] text-muted-foreground">{c.plano ? "pacote vinculado" : "sem pacote"}</div>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{c.modules} módulos</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Stat icon={Users} label="subusuários" value={c.subUsers} />
                <Stat icon={Music} label="seguidores" value={c.social ? c.social.toLocaleString("pt-BR") : "—"} />
                <Stat icon={Radio} label="canais áudio" value={c.canaisAudio} />
                <Stat icon={MonitorPlay} label="canais vídeo" value={c.canaisVideo.length} />
              </div>

              <div className="mt-auto rounded-lg border border-border/50 px-2.5 py-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Canais de vídeo</span>
                  {c.canaisCatalogo > 0 && (
                    <span className="text-[10px] text-muted-foreground">{c.canaisCatalogo} catálogo</span>
                  )}
                </div>
                {c.canaisVideo.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground">Nenhum canal de vídeo ativo</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {c.canaisVideo.map(v => (
                      <span
                        key={v.id}
                        title={v.name}
                        className="inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium"
                      >
                        <MonitorPlay className="w-3 h-3 shrink-0" />
                        <span className="truncate">{v.name}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
