import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Bot, Plus, Trash2, Loader2, Save, Zap, Calendar, Clock, Globe, FileText, ChevronDown, ChevronUp, Play } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

interface Programa {
  id: string;
  nome: string;
  estudio: string;
  tipo_programa?: string | null;
}

interface Automacao {
  id: string;
  programa_id: string;
  sites_source: string[];
  use_custom_news_sites: boolean;
  briefing: string;
  dias_semana: string[];
  horario: string;
  ativo: boolean;
}

interface Props {
  programas: Programa[];
  onGenerateRoteiro: (pasteText: string) => void;
}

const DIAS = [
  { key: "seg", label: "Seg" },
  { key: "ter", label: "Ter" },
  { key: "qua", label: "Qua" },
  { key: "qui", label: "Qui" },
  { key: "sex", label: "Sex" },
  { key: "sab", label: "Sáb" },
  { key: "dom", label: "Dom" },
];

export default function AutomacaoProgramaSection({ programas, onGenerateRoteiro }: Props) {
  const { user } = useAuth();
  const [automacoes, setAutomacoes] = useState<Automacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [formProgramaId, setFormProgramaId] = useState("");
  const [formSites, setFormSites] = useState<string[]>([""]);
  const [formUseCustom, setFormUseCustom] = useState(true);
  const [formBriefing, setFormBriefing] = useState("");
  const [formDias, setFormDias] = useState<string[]>([]);
  const [formHorario, setFormHorario] = useState("08:00");
  const [editingId, setEditingId] = useState<string | null>(null);

  const jornalisticos = programas.filter(p => p.tipo_programa?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === "jornalistico");

  const fetchAutomacoes = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("programa_automacoes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setAutomacoes(data as Automacao[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAutomacoes(); }, [fetchAutomacoes]);

  const resetForm = () => {
    setFormProgramaId("");
    setFormSites([""]);
    setFormUseCustom(true);
    setFormBriefing("");
    setFormDias([]);
    setFormHorario("08:00");
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (a: Automacao) => {
    setFormProgramaId(a.programa_id);
    setFormSites(a.sites_source.length > 0 ? a.sites_source : [""]);
    setFormUseCustom(a.use_custom_news_sites);
    setFormBriefing(a.briefing);
    setFormDias(a.dias_semana);
    setFormHorario(a.horario);
    setEditingId(a.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!user || !formProgramaId) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      programa_id: formProgramaId,
      sites_source: formSites.filter(s => s.trim()),
      use_custom_news_sites: formUseCustom,
      briefing: formBriefing,
      dias_semana: formDias,
      horario: formHorario,
      ativo: true,
    };

    try {
      if (editingId) {
        await supabase.from("programa_automacoes").update(payload).eq("id", editingId);
        toast.success("Automação atualizada!");
      } else {
        await supabase.from("programa_automacoes").insert(payload);
        toast.success("Automação criada!");
      }
      resetForm();
      await fetchAutomacoes();
    } catch (e) {
      toast.error("Erro ao salvar automação");
    }
    setSaving(false);
  };

  const handleToggleAtivo = async (a: Automacao) => {
    const novo = !a.ativo;
    await supabase.from("programa_automacoes").update({ ativo: novo }).eq("id", a.id);
    toast.success(novo ? "Automação ativada" : "Automação desativada");
    await fetchAutomacoes();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("programa_automacoes").delete().eq("id", id);
    toast.success("Automação removida");
    await fetchAutomacoes();
  };

  const handleGenerate = async (automacaoId: string) => {
    setGenerating(automacaoId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-automated-roteiro", {
        body: { automacao_id: automacaoId },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      if (data?.pasteText) {
        toast.success(`Roteiro gerado com ${data.totalNoticias} notícias!`);
        try { sessionStorage.setItem("roteiro_auto_generated", "1"); } catch {}
        onGenerateRoteiro(data.pasteText);
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar roteiro automatizado");
    }
    setGenerating(null);
  };

  const toggleDia = (d: string) => {
    setFormDias(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: "rgba(13,4,70,0.03)",
    border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)",
    color: "var(--layout-page-text, #1a1a1a)",
  };

  if (loading) return null;

  const hoje = format(new Date(), "yyyy-MM-dd");
  const diaSemanaHoje = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"][new Date().getDay()];

  return (
    <div className="px-6 pt-4 pb-2">
      {/* Seção de Configuração de Produção de Texto AI */}
      <div className="mb-4 rounded-xl p-3" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 5%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot size={14} className="text-blue-500" />
            <div>
              <p className="text-[11px] font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Produção de Texto Jornalístico (AI)</p>
              <p className="text-[9px] opacity-60">Habilite para que a AI escreva matérias completas para o TP</p>
            </div>
          </div>
          <button 
            onClick={async () => {
              const newValue = !((window as any).producao_ai_habilitada ?? true);
              (window as any).producao_ai_habilitada = newValue;
              // Trigger a small re-render or notification if needed
              toast.info(newValue ? "Produção de texto AI habilitada" : "Produção de texto AI desabilitada");
              // Note: Ideally this would be state in RoteiroPrograma or passed down, 
              // but we'll use a window variable or local storage for simplicity in this session
              localStorage.setItem("producao_ai_habilitada", String(newValue));
              // Force update via a simple trick if needed, or just let the user know
            }}
            className="relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none"
            style={{ backgroundColor: (localStorage.getItem("producao_ai_habilitada") !== "false") ? "#3b82f6" : "#cbd5e1" }}
          >
            <span 
              className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
              style={{ transform: (localStorage.getItem("producao_ai_habilitada") !== "false") ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </div>
      </div>

      <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)" }}>
        <div className="flex items-center gap-2 mb-2">
          <Bot size={12} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
          <p className="text-[11px] font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Automatização de Programa</p>
          {!showForm && (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="text-[9px] px-2 py-0.5 rounded-md font-bold flex items-center gap-1 hover:opacity-80 transition ml-auto"
              style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)", color: "var(--layout-accent-color, #2563eb)" }}
            >
              <Plus size={10} /> Nova Automação
            </button>
          )}
        </div>

        {automacoes.length > 0 && !showForm && (
          <div className="space-y-2 mb-2">
            {automacoes.map(a => {
              const prog = programas.find(p => p.id === a.programa_id);
              const isExpanded = expandedId === a.id;
              const isToday = a.dias_semana.includes(diaSemanaHoje);
              return (
                <div key={a.id} className="rounded-lg p-2.5 transition-all" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 12%, transparent)" }}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                        {prog?.nome || "Programa"}
                      </p>
                      <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                        <Clock size={9} className="inline mr-1" />{a.horario} · {a.dias_semana.map(d => DIAS.find(x => x.key === d)?.label).join(", ") || "Sem dias"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggleAtivo(a)}
                      className="text-[9px] px-2 py-1 rounded-md font-bold hover:opacity-80 transition"
                      style={{
                        backgroundColor: a.ativo
                          ? "color-mix(in srgb, #16a34a 15%, transparent)"
                          : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)",
                        color: a.ativo ? "#16a34a" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)",
                      }}
                      title={a.ativo ? "Clique para desativar" : "Clique para ativar"}
                    >
                      {a.ativo ? "Ativa" : "Inativa"}
                    </button>
                    <button
                      onClick={() => handleGenerate(a.id)}
                      disabled={!!generating}
                      className="text-[9px] px-2.5 py-1 rounded-md font-bold flex items-center gap-1 hover:opacity-80 transition disabled:opacity-40"
                      style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent)", color: "var(--layout-accent-color, #2563eb)" }}
                    >
                      {generating === a.id ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                      {generating === a.id ? "Gerando..." : `Abrir roteiro de ${prog?.nome || "Programa"} de hoje`}
                    </button>
                    <button onClick={() => setExpandedId(isExpanded ? null : a.id)} className="p-1 rounded hover:opacity-70" style={{ color: "var(--layout-page-text)" }}>
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="mt-2 pt-2 space-y-1.5" style={{ borderTop: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 12%, transparent)" }}>
                      {a.briefing && (
                        <p className="text-[10px] leading-relaxed" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
                          <FileText size={9} className="inline mr-1" />{a.briefing}
                        </p>
                      )}
                      {a.sites_source.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {a.sites_source.map((s, i) => (
                            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 8%, transparent)", color: "var(--layout-accent-color, #2563eb)" }}>
                              <Globe size={8} className="inline mr-0.5" />{new URL(s).hostname}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        <button onClick={() => handleEdit(a)} className="text-[9px] px-2 py-0.5 rounded font-bold hover:opacity-80" style={{ color: "var(--layout-accent-color, #2563eb)" }}>Editar</button>
                        <button onClick={() => handleDelete(a.id)} className="text-[9px] px-2 py-0.5 rounded font-bold hover:opacity-80" style={{ color: "#ef4444" }}>Excluir</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showForm && (
          <div className="space-y-3 mt-2 rounded-lg p-3" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 15%, transparent)" }}>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "#fff" }}>1</span>
                Programa Jornalístico
              </label>
              <Select value={formProgramaId} onValueChange={setFormProgramaId}>
                <SelectTrigger className="h-8 text-[11px] rounded-lg" style={inputStyle}>
                  <SelectValue placeholder="Selecione um programa jornalístico" />
                </SelectTrigger>
                <SelectContent>
                  {jornalisticos.map(p => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.nome} — {p.estudio}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "#fff" }}>2</span>
                Sites de Notícia (RSS)
              </label>
              <label className="flex items-center gap-2 mb-2 cursor-pointer">
                <input type="checkbox" checked={formUseCustom} onChange={e => setFormUseCustom(e.target.checked)} className="rounded" />
                <span className="text-[10px]" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Incluir portais já cadastrados</span>
              </label>
              <div className="space-y-1.5">
                {formSites.map((s, i) => (
                  <div key={i} className="flex gap-1.5">
                    <input
                      value={s}
                      onChange={e => { const arr = [...formSites]; arr[i] = e.target.value; setFormSites(arr); }}
                      placeholder="https://portal.com/rss"
                      className="flex-1 h-7 px-2 rounded-lg text-[10px] outline-none"
                      style={inputStyle}
                    />
                    {formSites.length > 1 && (
                      <button onClick={() => setFormSites(prev => prev.filter((_, j) => j !== i))} className="p-1 rounded hover:opacity-70" style={{ color: "#ef4444" }}>
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={() => setFormSites(prev => [...prev, ""])} className="text-[9px] font-bold flex items-center gap-1 hover:opacity-80" style={{ color: "var(--layout-accent-color, #2563eb)" }}>
                  <Plus size={9} /> Adicionar site
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                <FileText size={10} />
                Briefing do Programa
              </label>
              <textarea
                value={formBriefing}
                onChange={e => setFormBriefing(e.target.value)}
                placeholder="Ex: Faça esse programa em 3 blocos, no primeiro bloco comece com as informações do tempo depois 3 notícias locais, no 2 bloco notícias policiais e no último bloco notícias internacionais, monte uma escalada com 3 notícias, uma de cada bloco"
                className="w-full px-2 py-2 rounded-lg text-[10px] outline-none resize-none leading-relaxed"
                rows={4}
                style={inputStyle}
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "#fff" }}>3</span>
                Frequência
              </label>
              <div className="flex gap-1.5 mb-2">
                {DIAS.map(d => (
                  <button
                    key={d.key}
                    onClick={() => toggleDia(d.key)}
                    className="text-[9px] font-bold px-2 py-1 rounded-md transition-all"
                    style={{
                      backgroundColor: formDias.includes(d.key) ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)",
                      color: formDias.includes(d.key) ? "#fff" : "var(--layout-page-text, #1a1a1a)",
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Clock size={10} style={{ color: "var(--layout-page-text)" }} />
                <input
                  type="time"
                  value={formHorario}
                  onChange={e => setFormHorario(e.target.value)}
                  className="h-7 px-2 rounded-lg text-[10px] outline-none"
                  style={inputStyle}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving || !formProgramaId}
                className="flex-1 py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 hover:brightness-110 transition disabled:opacity-40"
                style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "#fff" }}
              >
                {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                {editingId ? "Atualizar" : "Salvar Automação"}
              </button>
              <button
                onClick={resetForm}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold hover:opacity-80 transition"
                style={{ color: "var(--layout-page-text, #1a1a1a)", backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
