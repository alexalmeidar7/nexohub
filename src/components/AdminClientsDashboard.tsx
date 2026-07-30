import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, Users, Radio, MonitorPlay, Layers, Search, Sparkles,
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
  type: string;
  active: boolean;
}

interface ClienteRow {
  user_id: string;
  nome: string;
  logo: string | null;
  plano: string | null;
  subUsers: number;
  modules: number;
  canaisVideo: number;
  canaisAudio: number;
  social: number;
}

const isVideo = (t?: string | null) => (t || "").toLowerCase().startsWith("video");
const isAudio = (t?: string | null) => (t || "").toLowerCase().startsWith("audio");

const compact = (n: number) =>
  n >= 1000 ? new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n) : String(n);

function KPI({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card px-4 py-3.5 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold leading-none tabular-nums">{value}</div>
        <div className="text-[11px] text-muted-foreground mt-1 truncate">{label}</div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, value, label }: { icon: any; value: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-muted/40">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <div className="text-sm font-semibold leading-none tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground leading-none">{label}</div>
    </div>
  );
}

export default function AdminClientsDashboard() {
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [empRes, profRes, subRes, cmRes, chanRes] = await Promise.all([
          supabase.from("empresa_config")
            .select("user_id, nome, logo, plano, ativo, instagram_subs, youtube_subs, facebook_subs")
            .eq("ativo", true)
            .order("nome"),
          supabase.from("profiles").select("user_id, email"),
          supabase.from("sub_users").select("parent_user_id, ativo"),
          supabase.from("client_modules").select("user_id, enabled"),
          supabase.from("streaming_channels").select("id, user_id, name, type, active"),
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
          const meus = canais.filter(c => c.user_id === e.user_id && c.active);
          return {
            user_id: e.user_id,
            nome: e.nome || emails.get(e.user_id) || "Sem nome",
            logo: e.logo,
            plano: e.plano,
            subUsers: subCount.get(e.user_id) || 0,
            modules: modCount.get(e.user_id) || 0,
            canaisVideo: meus.filter(c => isVideo(c.type)).length,
            canaisAudio: meus.filter(c => isAudio(c.type)).length,
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
    if (!q) return clientes;
    return clientes.filter(c =>
      c.nome.toLowerCase().includes(q) || (c.plano || "").toLowerCase().includes(q));
  }, [clientes, busca]);

  const totais = useMemo(() => ({
    clientes: clientes.length,
    video: clientes.reduce((a, c) => a + c.canaisVideo, 0),
    audio: clientes.reduce((a, c) => a + c.canaisAudio, 0),
    subs: clientes.reduce((a, c) => a + c.subUsers, 0),
  }), [clientes]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight leading-none">Painel Super Admin</h1>
            <p className="text-xs text-muted-foreground mt-1.5">Clientes ativos</p>
          </div>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar cliente ou pacote..."
            className="h-9 pl-9 pr-3 text-sm rounded-full bg-muted/50 border border-border/60 outline-none focus:border-primary/60 w-60"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI icon={Building2} label="Clientes ativos" value={totais.clientes} />
        <KPI icon={MonitorPlay} label="Canais de vídeo" value={totais.video} />
        <KPI icon={Radio} label="Canais de áudio" value={totais.audio} />
        <KPI icon={Users} label="Subusuários" value={totais.subs} />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/60 bg-card p-4 animate-pulse space-y-3">
              <div className="h-10 bg-muted rounded-xl" />
              <div className="h-8 bg-muted rounded-xl" />
              <div className="h-12 bg-muted rounded-xl" />
            </div>
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhum cliente ativo encontrado.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {filtrados.map(c => (
            <div
              key={c.user_id}
              className="group rounded-2xl border border-border/60 bg-card p-4 flex flex-col gap-3 hover:border-primary/40 hover:shadow-md transition"
            >
              <div className="flex items-center gap-3">
                {c.logo ? (
                  <img src={c.logo} alt={c.nome} className="w-11 h-11 rounded-xl object-contain bg-muted/50 p-1" />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-muted/50 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate leading-tight">{c.nome}</div>
                  <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium max-w-full">
                    <Layers className="w-3 h-3 shrink-0" />
                    <span className="truncate">{c.plano || "sem pacote"}</span>
                  </div>
                </div>
                <span className="shrink-0 w-2 h-2 rounded-full bg-primary" />
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                <Metric icon={Users} value={c.subUsers} label="subs" />
                <Metric icon={Radio} value={c.canaisAudio} label="áudio" />
                <Metric icon={MonitorPlay} value={c.canaisVideo} label="vídeo" />
                <Metric icon={Sparkles} value={compact(c.social)} label="social" />
              </div>

              <div className="mt-auto pt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{c.modules} módulos liberados</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
