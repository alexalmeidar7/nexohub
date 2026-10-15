import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3, Gift, History, Truck, Siren, Tag, MonitorPlay, Search,
  CalendarDays, Clock3, RefreshCw, Loader2, AlertCircle, Package,
  CheckCircle2, CircleX, UserRound, Image as ImageIcon
} from "lucide-react";

type ReportKey = "estoque" | "sorteios" | "entregas" | "blitz" | "comercial" | "vmix";
type AnyRow = Record<string, any>;

const REPORTS: { key: ReportKey; label: string; description: string; icon: typeof Gift }[] = [
  { key: "estoque", label: "Prêmios em estoque", description: "Prêmios não retirados que retornaram ao estoque", icon: Package },
  { key: "sorteios", label: "Sorteios realizados", description: "Histórico de ganhadores e situação da entrega", icon: Gift },
  { key: "entregas", label: "Entregas de prêmios", description: "Comprovantes e fotos dos ganhadores", icon: Truck },
  { key: "blitz", label: "Blitz", description: "Ações realizadas e seus horários", icon: Siren },
  { key: "comercial", label: "Comercial", description: "Promoções ativas no período", icon: Tag },
  { key: "vmix", label: "vMix", description: "Uso dos botões personalizados por locutor", icon: MonitorPlay },
];

const localKey = (name: string, userId: string) => `nexohub_${name}_${userId}`;
function readLocal(name: string, userId: string): AnyRow[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(localKey(name, userId)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function dateOnly(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? value + "T12:00:00" : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}
function dateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function timeOnly(value?: string | null) {
  if (!value) return "—";
  return value.length > 5 ? value.slice(0, 5) : value;
}
function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function TableEmpty({ text }: { text: string }) {
  return <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center"><AlertCircle size={24} className="text-slate-300" /><p className="text-sm font-semibold text-slate-500">{text}</p></div>;
}
function Th({ children }: { children: React.ReactNode }) { return <th className="whitespace-nowrap px-4 py-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{children}</th>; }
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <td className={`px-4 py-3 text-xs text-slate-700 ${className}`}>{children}</td>; }
function Status({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{ok ? <CheckCircle2 size={12} /> : <CircleX size={12} />}{ok ? yes : no}</span>;
}

export default function RelatoriosPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const userId = effectiveUserId || user?.id || "";
  const [active, setActive] = useState<ReportKey>("estoque");
  const [prizesMenuOpen, setPrizesMenuOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [prizes, setPrizes] = useState<AnyRow[]>([]);
  const [draws, setDraws] = useState<AnyRow[]>([]);
  const [blitzes, setBlitzes] = useState<AnyRow[]>([]);
  const [promos, setPromos] = useState<AnyRow[]>([]);
  const [vmixEvents, setVmixEvents] = useState<AnyRow[]>([]);
  const [vmixUnavailable, setVmixUnavailable] = useState(false);

  const load = async (manual = false) => {
    if (!userId) { setLoading(false); return; }
    if (manual) setRefreshing(true); else setLoading(true);
    const [p, d, b, c, v] = await Promise.all([
      supabase.from("sorteio_premios").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("sorteio_sorteios").select("*").eq("user_id", userId).order("data_sorteio", { ascending: false }),
      supabase.from("blitz_promocionais").select("*").eq("user_id", userId).order("dia", { ascending: false }),
      supabase.from("promocoes").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      (supabase.from("vmix_button_interactions" as any).select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1000) as any),
    ]);
    const localPrizes = readLocal("premios", userId);
    const localDraws = readLocal("sorteios", userId);
    const localBlitz = readLocal("blitz", userId);
    const localPromos = readLocal("promocoes", userId);
    setPrizes(p.data?.length ? p.data as AnyRow[] : localPrizes);
    setDraws(d.data?.length ? d.data as AnyRow[] : localDraws);
    setBlitzes(b.data?.length ? b.data as AnyRow[] : localBlitz);
    setPromos(c.data?.length ? c.data as AnyRow[] : localPromos);
    setVmixEvents(v.data || []);
    setVmixUnavailable(Boolean(v.error));
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { void load(); }, [userId]);

  const prizeById = useMemo(() => new Map(prizes.map(p => [p.id, p])), [prizes]);
  const filtered = <T extends AnyRow,>(rows: T[], fields: string[]) => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    if (!q) return rows;
    return rows.filter(row => fields.some(field => String(row[field] ?? "").toLocaleLowerCase("pt-BR").includes(q)));
  };
  const expiredDraws = useMemo(() => {
    const now = Date.now();
    return draws.filter(d => !d.entregue && (d.expirado === true || (d.data_expiracao && new Date(d.data_expiracao).getTime() < now)));
  }, [draws]);
  const deliveredDraws = useMemo(() => draws.filter(d => d.entregue === true), [draws]);
  const activePromos = useMemo(() => {
    const today = todayISO();
    return promos.filter(p => p.ativo !== false && (!p.data_inicio || p.data_inicio <= today) && (!p.data_fim || p.data_fim >= today));
  }, [promos]);
  const vmixRanking = useMemo(() => {
    const totals = new Map<string, { name: string; clicks: number; lastClick: string; buttons: Set<string> }>();
    vmixEvents.forEach(event => {
      const name = String(event.locutor_nome || event.apresentador_nome || event.user_email || "Locutor não identificado");
      const current = totals.get(name) || { name, clicks: 0, lastClick: event.created_at || "", buttons: new Set<string>() };
      current.clicks += 1;
      if (event.created_at && (!current.lastClick || event.created_at > current.lastClick)) current.lastClick = event.created_at;
      if (event.button_name) current.buttons.add(String(event.button_name));
      totals.set(name, current);
    });
    return Array.from(totals.values()).sort((a, b) => b.clicks - a.clicks);
  }, [vmixEvents]);

  const activeReport = REPORTS.find(r => r.key === active)!;
  const Icon = activeReport.icon;

  return (
    <div className="min-h-full bg-slate-50 p-4 md:p-6" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.2em] text-blue-600"><BarChart3 size={14} /> Central de relatórios</div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Relatórios</h1>
            <p className="mt-1 text-xs text-slate-500">Acompanhe sorteios, entregas, ações comerciais e uso do vMix em um só lugar.</p>
          </div>
          <button onClick={() => void load(true)} disabled={refreshing} className="inline-flex h-10 items-center gap-2 rounded-full bg-blue-600 px-4 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-60">
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar dados
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[245px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <p className="px-3 pb-2 pt-3 text-[9px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Escolha um relatório</p>
            <nav className="space-y-1">
              <button
                onClick={() => setPrizesMenuOpen(value => !value)}
                aria-expanded={prizesMenuOpen}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${["sorteios", "entregas", "estoque"].includes(active) ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${["sorteios", "entregas", "estoque"].includes(active) ? "bg-white/15" : "bg-slate-100 text-blue-600"}`}><Gift size={17} /></span>
                <span className="min-w-0 flex-1"><span className="block text-[11px] font-extrabold uppercase">Sorteios de Prêmios</span><span className={`mt-1 block text-[9px] leading-snug ${["sorteios", "entregas", "estoque"].includes(active) ? "text-blue-100" : "text-slate-400"}`}>Sorteios, entregas e controle de estoque</span></span>
                <span className="text-xs font-bold">{prizesMenuOpen ? "−" : "+"}</span>
              </button>
              {prizesMenuOpen && <div className="ml-4 space-y-1 border-l-2 border-slate-100 pl-3 py-1">
                {REPORTS.filter(report => ["sorteios", "entregas", "estoque"].includes(report.key)).map(report => {
                  const ItemIcon = report.icon;
                  const selected = active === report.key;
                  const label = report.key === "sorteios" ? "Sorteios realizados" : report.key === "entregas" ? "Entregas" : "Estoque de prêmios";
                  return <button key={report.key} onClick={() => { setActive(report.key); setSearch(""); }} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition ${selected ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
                    <ItemIcon size={15} />
                    <span className="text-[10px] font-extrabold uppercase">{label}</span>
                  </button>;
                })}
              </div>}
              {REPORTS.filter(report => ["blitz", "comercial", "vmix"].includes(report.key)).map(report => {
                const ItemIcon = report.icon;
                const selected = active === report.key;
                return <button key={report.key} onClick={() => { setActive(report.key); setSearch(""); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${selected ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-white/15" : "bg-slate-100 text-blue-600"}`}><ItemIcon size={17} /></span>
                  <span className="min-w-0"><span className="block text-[11px] font-extrabold uppercase">{report.label}</span><span className={`mt-1 block text-[9px] leading-snug ${selected ? "text-blue-100" : "text-slate-400"}`}>{report.description}</span></span>
                </button>;
              })}
            </nav>
          </aside>

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Icon size={21} /></div><div><h2 className="text-base font-black uppercase tracking-tight text-slate-900">{activeReport.label}</h2><p className="mt-1 text-[11px] text-slate-500">{activeReport.description}</p></div></div>
              <div className="relative w-full sm:w-64"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar neste relatório..." className="h-10 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-4 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div>
            </div>

            {loading ? <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500"><Loader2 size={16} className="animate-spin" /> Carregando relatórios...</div> : (
              <>
                {active === "estoque" && (expiredDraws.length ? <div className="overflow-x-auto rounded-xl border border-slate-100"><table className="w-full"><thead className="bg-slate-50"><tr><Th>Prêmio</Th><Th>Ganhador</Th><Th>Data do sorteio</Th><Th>Prazo encerrado</Th><Th>Status</Th></tr></thead><tbody>{filtered(expiredDraws, ["nome_ganhador", "programa_nome", "observacoes"]).map(d => <tr key={d.id} className="border-t border-slate-100"><Td><div className="font-bold text-slate-900">{prizeById.get(d.premio_id)?.nome || d.premio_nome || "Prêmio não identificado"}</div></Td><Td>{d.nome_ganhador || "—"}</Td><Td>{dateTime(d.data_sorteio)}</Td><Td>{dateTime(d.data_expiracao)}</Td><Td><Status ok={false} yes="Retirado" no="Retornou ao estoque" /></Td></tr>)}</tbody></table></div> : <TableEmpty text="Nenhum prêmio vencido e não retirado encontrado." />)}

                {active === "sorteios" && (draws.length ? <div className="overflow-x-auto rounded-xl border border-slate-100"><table className="w-full"><thead className="bg-slate-50"><tr><Th>Dia e horário</Th><Th>Locutor / programa</Th><Th>Ganhador</Th><Th>Prêmio</Th><Th>Retirada</Th></tr></thead><tbody>{filtered(draws, ["nome_ganhador", "programa_nome", "apresentador_nome", "observacoes"]).map(d => <tr key={d.id} className="border-t border-slate-100"><Td>{dateTime(d.data_sorteio)}</Td><Td><div className="font-semibold">{d.apresentador_nome || d.locutor_nome || "—"}</div><div className="mt-1 text-[10px] text-slate-400">{d.programa_nome || "Programa não informado"}</div></Td><Td><div className="font-bold text-slate-900">{d.nome_ganhador || "—"}</div></Td><Td>{prizeById.get(d.premio_id)?.nome || d.premio_nome || "—"}</Td><Td><Status ok={Boolean(d.entregue)} yes="Retirado" no="Pendente" /></Td></tr>)}</tbody></table></div> : <TableEmpty text="Ainda não há sorteios registrados." />)}

                {active === "entregas" && (deliveredDraws.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtered(deliveredDraws, ["nome_ganhador", "apresentador_nome", "programa_nome"]).map(d => <article key={d.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex h-36 items-center justify-center bg-slate-100">{d.foto_entrega_url ? <img src={d.foto_entrega_url} alt={d.nome_ganhador || "Foto do ganhador"} className="h-full w-full object-cover" loading="lazy" /> : <div className="flex flex-col items-center gap-2 text-slate-300"><ImageIcon size={30} /><span className="text-[10px]">Sem foto de entrega</span></div>}</div><div className="p-4"><div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Data da entrega</div><div className="mt-1 text-xs font-bold text-slate-800">{dateTime(d.data_entrega || d.data_sorteio)}</div><div className="mt-3 flex items-center gap-2 text-sm font-black text-slate-900"><UserRound size={15} className="text-blue-600" />{d.nome_ganhador || "Ganhador não informado"}</div><div className="mt-1 text-[10px] text-slate-500">{prizeById.get(d.premio_id)?.nome || "Prêmio"}</div></div></article>)}</div> : <TableEmpty text="Nenhuma entrega de prêmio registrada." />)}

                {active === "blitz" && (() => { const rows = filtered(blitzes.filter(b => b.realizada === true), ["cliente", "equipe", "observacoes"]); return rows.length ? <div className="overflow-x-auto rounded-xl border border-slate-100"><table className="w-full"><thead className="bg-slate-50"><tr><Th>Dia</Th><Th>Cliente / ação</Th><Th>Hora inicial</Th><Th>Hora final</Th><Th>Equipe</Th></tr></thead><tbody>{rows.map(b => <tr key={b.id} className="border-t border-slate-100"><Td>{dateOnly(b.dia)}</Td><Td className="font-bold text-slate-900">{b.cliente || "Blitz"}</Td><Td><span className="inline-flex items-center gap-1"><Clock3 size={12} className="text-blue-500" />{timeOnly(b.horario)}</span></Td><Td>{timeOnly(b.horario_fim)}</Td><Td>{b.equipe || "—"}</Td></tr>)}</tbody></table></div> : <TableEmpty text="Nenhuma blitz realizada encontrada." />; })()}

                {active === "comercial" && (activePromos.length ? <div className="grid gap-3 md:grid-cols-2">{filtered(activePromos, ["nome", "texto", "oferecimento"]).map(p => <article key={p.id} className="overflow-hidden rounded-2xl border border-slate-200"><div className="flex items-center gap-3 p-4">{p.imagem_url ? <img src={p.imagem_url} alt={p.nome || "Promoção"} className="h-16 w-16 rounded-xl object-cover" loading="lazy" /> : <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Tag size={22} /></div>}<div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Promoção ativa</div><h3 className="mt-1 truncate text-sm font-black text-slate-900">{p.nome || "Promoção sem nome"}</h3><p className="mt-1 text-[10px] text-slate-500">{p.oferecimento || "Sem patrocinador informado"}</p></div></div><div className="border-t border-slate-100 px-4 py-3"><p className="text-xs leading-relaxed text-slate-600">{String(p.texto || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() || "Sem descrição."}</p><div className="mt-3 flex items-center gap-3 text-[10px] text-slate-400"><span className="inline-flex items-center gap-1"><CalendarDays size={12} />{dateOnly(p.data_inicio)} – {dateOnly(p.data_fim)}</span></div></div></article>)}</div> : <TableEmpty text="Não há promoções ativas hoje." />)}

                {active === "vmix" && (vmixEvents.length ? <><div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-blue-50 p-4"><div className="text-[10px] font-bold uppercase text-blue-500">Cliques registrados</div><div className="mt-1 text-2xl font-black text-blue-700">{vmixEvents.length}</div></div><div className="rounded-xl bg-slate-50 p-4"><div className="text-[10px] font-bold uppercase text-slate-400">Locutores identificados</div><div className="mt-1 text-2xl font-black text-slate-800">{new Set(vmixEvents.map(e => e.locutor_nome || e.apresentador_nome).filter(Boolean)).size}</div></div><div className="rounded-xl bg-slate-50 p-4"><div className="text-[10px] font-bold uppercase text-slate-400">Botões diferentes</div><div className="mt-1 text-2xl font-black text-slate-800">{new Set(vmixEvents.map(e => e.button_id).filter(Boolean)).size}</div></div></div>{vmixRanking.length > 0 && <div className="mb-4 overflow-hidden rounded-xl border border-slate-100"><div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-600">Ranking de utilização por locutor</div><div className="divide-y divide-slate-100">{vmixRanking.map((item, index) => <div key={item.name} className="flex items-center gap-3 px-4 py-3"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${index === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{index + 1}º</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-slate-800">{item.name}</div><div className="mt-1 text-[10px] text-slate-400">{item.buttons.size} botão(ões) diferentes · último clique {dateTime(item.lastClick)}</div></div><div className="text-right"><div className="text-lg font-black text-blue-700">{item.clicks}</div><div className="text-[9px] font-bold uppercase text-slate-400">cliques</div></div></div>)}</div></div>}<div className="overflow-x-auto rounded-xl border border-slate-100"><table className="w-full"><thead className="bg-slate-50"><tr><Th>Data / hora</Th><Th>Locutor</Th><Th>Estúdio</Th><Th>Botão acionado</Th><Th>Programa</Th></tr></thead><tbody>{filtered(vmixEvents, ["locutor_nome", "apresentador_nome", "studio_name", "button_name", "program_name"]).map(e => <tr key={e.id} className="border-t border-slate-100"><Td>{dateTime(e.created_at)}</Td><Td className="font-bold">{e.locutor_nome || e.apresentador_nome || e.user_email || "—"}</Td><Td>{e.studio_name || "—"}</Td><Td>{e.button_name || "Botão personalizado"}</Td><Td>{e.program_name || "—"}</Td></tr>)}</tbody></table></div></> : <TableEmpty text={vmixUnavailable ? "O registro de cliques do vMix ainda não está disponível no banco de dados. Após habilitar a tabela de interações, os próximos cliques aparecerão aqui." : "Ainda não há cliques de botões personalizados registrados."} />)}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
