import { useState, useEffect } from "react";
import { Sparkles, Plus, Trash2, CalendarPlus, Save, Loader2, X, HelpCircle, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirmDialog";
import { todayInBrasilia } from "@/lib/brasiliaDate";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { findClientAccountByEmail, findClientAccountById } from "@/lib/clientAuthAccounts";
import { getScheduleStatus, isScheduleActive, getBrasiliaDateTime } from "@/lib/scheduledItemUtils";

interface QuizAgendado {
  id: string;
  pergunta: string;
  resposta1: string;
  resposta2: string;
  resposta3: string;
  resposta4: string;
  resposta_correta: number;
  data_quiz: string;
  horario_inicio: string;
  horario_fim: string;
  explicacao: string;
}

export default function QuizPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const clientAcc = findClientAccountByEmail(user?.email || "") || findClientAccountById(user?.id || "");
  const targetUserId = effectiveUserId || clientAcc?.parentUserId || clientAcc?.id || user?.id;
  const targetSlug = clientAcc?.slug || (user as any)?.user_metadata?.slug || "positivafm";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quizzes, setQuizzes] = useState<QuizAgendado[]>([]);
  const [showForm, setShowForm] = useState(true);
  const [, setTick] = useState(0);

  // Auto-refresh badges and active state every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);
  
  const [formData, setFormData] = useState({
    pergunta: "",
    resposta1: "",
    resposta2: "",
    resposta3: "",
    resposta4: "",
    resposta_correta: 1,
    data_quiz: todayInBrasilia(),
    horario_inicio: "00:00",
    horario_fim: "23:59",
    explicacao: ""
  });

  const getLocalStorageKey = (uId: string) => `nexohub_quizzes_${uId}`;

  const getStorageKeys = (uId: string): string[] => {
    return Array.from(new Set([
      getLocalStorageKey(uId),
      getLocalStorageKey(targetSlug),
      `nexohub_quizzes_${uId}`,
      `nexohub_quizzes_${targetSlug}`,
      clientAcc?.id ? `nexohub_quizzes_${clientAcc.id}` : null,
      clientAcc?.parentUserId ? `nexohub_quizzes_${clientAcc.parentUserId}` : null,
    ].filter(Boolean) as string[]));
  };

  const getStoredQuizzes = (uId: string): QuizAgendado[] => {
    const map = new Map<string, QuizAgendado>();
    try {
      const keys = getStorageKeys(uId);
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.forEach((q: QuizAgendado) => {
              if (q && q.id) {
                map.set(q.id, { ...(map.get(q.id) || {}), ...q });
              }
            });
          }
        }
      }
    } catch {}
    return Array.from(map.values());
  };

  const saveStoredQuizzes = (uId: string, list: QuizAgendado[]) => {
    try {
      const keys = getStorageKeys(uId);
      const json = JSON.stringify(list);
      for (const key of keys) {
        localStorage.setItem(key, json);
      }

      // Sincroniza com o servidor local e endpoints XML em tempo real
      fetch("/api/sync-xml-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: targetSlug, userId: uId, quizzes: list }),
      }).catch(() => {});

      // Sincroniza imediatamente com a Supabase Edge Function para vMix remoto
      if (import.meta.env.VITE_SUPABASE_URL) {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-xml-quiz`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sync", slug: targetSlug, userId: uId, quizzes: list }),
        }).catch(() => {});
      }
    } catch {}
  };

  const fetchQuizzes = async () => {
    if (!targetUserId) return;
    let rows: QuizAgendado[] = [];
    let databaseLoaded = false;
    try {
      const { data, error } = await supabase.from("quiz_agendados")
        .select("*").eq("user_id", targetUserId).order("data_quiz", { ascending: false });
      if (error) throw error;
      rows = (data || []) as QuizAgendado[];
      databaseLoaded = true;
    } catch (err) {
      console.warn("Supabase fetch quizzes warning:", err);
    }

    let merged: QuizAgendado[] = [];
    if (databaseLoaded) {
      merged = rows;
    } else {
      let serverQuizzes: QuizAgendado[] = [];
      try {
        const resp = await fetch("/api/sync-xml-quiz?slug=" + encodeURIComponent(targetSlug) + "&userId=" + encodeURIComponent(targetUserId));
        if (resp.ok) {
          const json = await resp.json();
          if (Array.isArray(json?.quizzes)) serverQuizzes = json.quizzes;
        }
      } catch {}
      const localList = getStoredQuizzes(targetUserId);
      const map = new Map<string, QuizAgendado>();
      serverQuizzes.forEach(item => item?.id && map.set(item.id, item));
      localList.forEach(item => item?.id && map.set(item.id, { ...(map.get(item.id) || {}), ...item }));
      merged = Array.from(map.values());
    }
    merged.sort((a, b) => {
      const dateCmp = (b.data_quiz || "").localeCompare(a.data_quiz || "");
      if (dateCmp !== 0) return dateCmp;
      return (b.horario_inicio || "").localeCompare(a.horario_inicio || "");
    });
    setQuizzes(merged);
    saveStoredQuizzes(targetUserId, merged);
    setLoading(false);
  };

  useEffect(() => {
    fetchQuizzes();
  }, [targetUserId]);

  const handleSave = async () => {
    if (!targetUserId) return;
    if (!formData.pergunta || !formData.resposta1 || !formData.resposta2) {
      toast.error("Preencha a pergunta e pelo menos as duas primeiras respostas.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("quiz_agendados")
        .insert([{ ...formData, user_id: targetUserId }])
        .select("id")
        .single();
      if (error) throw error;
      if (!data?.id) throw new Error("O banco não confirmou o cadastro do quiz.");

      const newQuiz: QuizAgendado = { id: data.id, ...formData };
      const updated = [newQuiz, ...quizzes.filter(q => q.id !== data.id)];
      setQuizzes(updated);
      saveStoredQuizzes(targetUserId, updated);
      setFormData({
        pergunta: "", resposta1: "", resposta2: "", resposta3: "", resposta4: "",
        resposta_correta: 1, data_quiz: todayInBrasilia(), horario_inicio: "00:00",
        horario_fim: "23:59", explicacao: "",
      });
      setShowForm(false);
      toast.success("Quiz cadastrado no banco com sucesso!");
    } catch (err: any) {
      console.error("Falha ao salvar quiz:", err);
      toast.error("Quiz não foi salvo: " + (err?.message || "falha ao gravar no banco."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDialog({
      title: "Excluir Quiz",
      message: "Tem certeza que deseja excluir este quiz?",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!confirmed || !targetUserId) return;
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid) {
        const { data, error } = await supabase.from("quiz_agendados")
          .delete().eq("id", id).eq("user_id", targetUserId).select("id").maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error("O banco não confirmou a exclusão do quiz.");
      }
      const updated = quizzes.filter(q => q.id !== id);
      setQuizzes(updated);
      saveStoredQuizzes(targetUserId, updated);
      toast.success("Quiz excluído com sucesso.");
    } catch (err: any) {
      toast.error("Quiz não foi excluído: " + (err?.message || "falha ao excluir no banco."));
    }
  };

  if (loading) return <ModulePageSkeleton variant="form" />;

  return (
    <div className="nexo-scope space-y-4 w-full max-w-none mx-0">
      <div id="module-header-title" style={{ display: "none" }}>
        vMix — Quiz
      </div>

      <div className="flex justify-between items-center bg-white p-5 rounded-3xl border border-slate-200/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-3">
          <div style={{ width: 44, height: 44, borderRadius: 16, background: "#0055ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={20} color="#fff" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-[#002132]">
              Gerenciamento de Quizzes
            </h2>
            <p className="text-xs text-slate-400 font-medium">Agendamento e controle de quizzes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/xml/${targetSlug}/quiz.xml`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 px-5 rounded-full font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-[#0055ff] border border-slate-200/80 transition shadow-sm"
            title="Abrir feed XML do Quiz no navegador ou vMix"
          >
            <ExternalLink size={15} className="text-[#0055ff]" />
            <span>XML QUIZ</span>
          </a>
          <button 
            onClick={() => setShowForm(!showForm)}
            className={`h-11 px-6 rounded-full font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all cursor-pointer ${
              showForm ? "bg-slate-100 hover:bg-slate-200 text-slate-700" : "bg-[#0055ff] hover:bg-[#0047d4] text-white shadow-md hover:shadow-blue-500/20"
            }`}
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancelar" : "Novo Quiz"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300 p-6 bg-white rounded-3xl border border-slate-200/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748b] block mb-1.5">Pergunta</label>
                <Input 
                  value={formData.pergunta}
                  onChange={e => setFormData(prev => ({ ...prev, pergunta: e.target.value }))}
                  placeholder="Qual o nome do primeiro álbum dos Beatles?"
                  className="rounded-full h-11 bg-[#f8fafc] border-slate-200/90 text-xs font-semibold uppercase px-5 focus:bg-white focus:border-[#0055ff]"
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(idx => (
                  <div key={idx}>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748b] block mb-1.5">
                      Resposta {idx} {idx > 2 && "(Opcional)"}
                    </label>
                    <div className="flex gap-2">
                      <Input 
                        value={(formData as any)[`resposta${idx}`]}
                        onChange={e => setFormData(prev => ({ ...prev, [`resposta${idx}`]: e.target.value }))}
                        className={`rounded-full h-11 bg-[#f8fafc] border-slate-200/90 text-xs font-semibold uppercase px-5 focus:bg-white focus:border-[#0055ff] ${formData.resposta_correta === idx ? 'ring-2 ring-[#0055ff]' : ''}`}
                      />
                      <button 
                        onClick={() => setFormData(prev => ({ ...prev, resposta_correta: idx }))}
                        className={`px-4 rounded-full border text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                          formData.resposta_correta === idx 
                          ? 'bg-[#0055ff] border-[#0055ff] text-white shadow-sm' 
                          : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-[#0055ff]/50'
                        }`}
                      >
                        CORRETA
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748b] block mb-1.5">Explicação / Curiosidade (Opcional)</label>
                <Input 
                  value={formData.explicacao}
                  onChange={e => setFormData(prev => ({ ...prev, explicacao: e.target.value }))}
                  placeholder="O álbum Please Please Me foi gravado em apenas um dia..."
                  className="rounded-full h-11 bg-[#f8fafc] border-slate-200/90 text-xs font-semibold uppercase px-5 focus:bg-white focus:border-[#0055ff]"
                />
              </div>
            </div>

            <div className="space-y-4 p-5 bg-[#f8fafc] rounded-2xl border border-slate-200/80">
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2 mb-2 text-[#002132]">
                <CalendarPlus size={16} className="text-[#0055ff]" /> Agendamento
              </h3>
              
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748b] block mb-1.5">Data do Quiz</label>
                  <Input 
                    type="date"
                    value={formData.data_quiz}
                    onChange={e => setFormData(prev => ({ ...prev, data_quiz: e.target.value }))}
                    className="rounded-full h-11 bg-white border-slate-200/90 text-xs font-semibold uppercase px-5 focus:border-[#0055ff]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748b] block mb-1.5">Início</label>
                    <Input 
                      type="time"
                      value={formData.horario_inicio}
                      onChange={e => setFormData(prev => ({ ...prev, horario_inicio: e.target.value }))}
                      className="rounded-full h-11 bg-white border-slate-200/90 text-xs font-semibold uppercase px-5 focus:border-[#0055ff]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748b] block mb-1.5">Fim</label>
                    <Input 
                      type="time"
                      value={formData.horario_fim}
                      onChange={e => setFormData(prev => ({ ...prev, horario_fim: e.target.value }))}
                      className="rounded-full h-11 bg-white border-slate-200/90 text-xs font-semibold uppercase px-5 focus:border-[#0055ff]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button 
              disabled={saving}
              onClick={handleSave}
              className="h-11 px-8 rounded-full bg-[#0055ff] hover:bg-[#0047d4] active:scale-95 text-white font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 shadow-md hover:shadow-lg hover:shadow-blue-500/20 cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Save className="h-4 w-4 text-white" />}
              Salvar e Agendar Quiz
            </button>
          </div>
        </div>
      )}

      <section
        style={{
          background: "#FFFFFF",
          borderRadius: 24,
          padding: 32,
          boxShadow: "0 2px 12px rgba(10, 37, 64, 0.05)",
          fontFamily: "'Montserrat', sans-serif",
        }}
      >
        <div className="flex items-center justify-between mb-8">
          <h2
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 2,
              color: "#0A2540",
              textTransform: "uppercase",
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <CalendarPlus size={24} style={{ color: "#00BFF0" }} />
            Próximos Quizzes
          </h2>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#0A2540",
              background: "#D6F4FB",
              padding: "6px 16px",
              borderRadius: 999,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Total: <span style={{ color: "#00BFF0" }}>{quizzes.length}</span>
          </div>
        </div>

        <div className="overflow-x-auto" style={{ borderRadius: 24, border: `1px solid #00BFF022` }}>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ background: "#00BFF0" }}>
                <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none" }}>Data / Horário</th>
                <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none" }}>Pergunta</th>
                <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none" }}>Opções</th>
                <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none" }}>Status</th>
                <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none", textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {quizzes.length > 0 ? quizzes.map((q, idx) => {
                const status = getScheduleStatus(q.data_quiz, q.horario_inicio, q.horario_fim);
                return (
                  <tr
                    key={q.id}
                    style={{
                      background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC",
                      transition: "background 0.2s ease"
                    }}
                    className="hover:bg-[#F1F5F9]"
                  >
                    <td style={{ padding: "14px 20px", fontSize: 13, color: "#0A2540" }}>
                      <div className="flex flex-col">
                        <span style={{ fontWeight: 700 }}>
                          {new Date(q.data_quiz + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </span>
                        <span style={{ fontSize: 10, opacity: 0.6 }}>
                          {q.horario_inicio} - {q.horario_fim}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 13, fontWeight: 500, color: "#0A2540" }}>
                      <p>{q.pergunta}</p>
                      {q.explicacao && <p style={{ fontSize: 10, color: "#64748B", marginTop: 4, fontStyle: "italic" }}>{q.explicacao}</p>}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 13, color: "#0A2540" }}>
                      <div className="flex flex-wrap gap-2">
                        {[q.resposta1, q.resposta2, q.resposta3, q.resposta4].filter(Boolean).map((resp, i) => (
                          <span 
                            key={i} 
                            style={{ 
                              padding: "2px 8px", 
                              background: q.resposta_correta === (i + 1) ? "#C6F03C" : "#D6F4FB", 
                              borderRadius: 999, 
                              fontSize: 10, 
                              color: "#0A2540", 
                              fontWeight: 600,
                              border: q.resposta_correta === (i + 1) ? "1px solid #0A254022" : "none"
                            }}
                          >
                            {resp}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 12 }}>
                      {status === "active" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 animate-pulse">
                          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                          NO AR AGORA
                        </span>
                      ) : status === "scheduled" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-blue-50 text-[#0055ff] border border-blue-200/80">
                          AGENDADO
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500">
                          ENCERRADO
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "14px 20px", textAlign: "right" }}>
                      <button
                        onClick={() => handleDelete(q.id)}
                        style={{
                          width: 32, height: 32, borderRadius: 12,
                          background: "#FEE2E2", border: "none", cursor: "pointer",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          color: "#DC2626", transition: "all 0.2s"
                        }}
                        className="hover:scale-110 active:scale-95"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={5} style={{ padding: "48px 0", textAlign: "center", color: "#64748B" }}>
                    <HelpCircle size={48} className="mx-auto mb-3 opacity-20" />
                    <p style={{ fontSize: 14, fontWeight: 500 }}>Nenhum quiz agendado no momento.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}