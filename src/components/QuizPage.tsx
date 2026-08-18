import { useState, useEffect } from "react";
import { Sparkles, Plus, Trash2, CalendarPlus, Save, Loader2, X, HelpCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import XmlLinkRow from "./XmlLinkRow";
import XmlSection from "./XmlSection";
import { toast } from "sonner";
import { todayInBrasilia } from "@/lib/brasiliaDate";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

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

export default function QuizPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quizzes, setQuizzes] = useState<QuizAgendado[]>([]);
  const [showForm, setShowForm] = useState(true);
  
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

  const xmlUrl = user ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-xml-quiz?user_id=${user.id}` : "";

  const fetchQuizzes = async () => {
    if (!user) return;
    
    const now = new Date();
    const today = todayInBrasilia();
    const currentTime = now.toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit' });

    const { data, error } = await supabase
      .from("quiz_agendados")
      .select("*")
      .eq("user_id", user.id)
      .order("data_quiz", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar quizzes");
    } else if (data) {
      // Filter valid quizzes (not finished)
      const validQuizzes = data.filter(q => {
        if (q.data_quiz > today) return true;
        if (q.data_quiz === today && q.horario_fim >= currentTime) return true;
        return false;
      });

      // Remove expired from DB
      const expiredIds = data
        .filter(q => !validQuizzes.find(v => v.id === q.id))
        .map(q => q.id);

      if (expiredIds.length > 0) {
        await supabase
          .from("quiz_agendados")
          .delete()
          .in("id", expiredIds);
      }

      setQuizzes(validQuizzes as QuizAgendado[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchQuizzes();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    if (!formData.pergunta || !formData.resposta1 || !formData.resposta2) {
      toast.error("Preencha a pergunta e pelo menos as duas primeiras respostas.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("quiz_agendados")
        .insert([{
          ...formData,
          user_id: user.id
        }]);

      if (error) throw error;
      
      // Cleanup: Keep only last 20
      const { data: latestQuizzes } = await supabase
        .from("quiz_agendados")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      if (latestQuizzes && latestQuizzes.length > 20) {
        const idsToDelete = latestQuizzes.slice(20).map(q => q.id);
        await supabase
          .from("quiz_agendados")
          .delete()
          .in("id", idsToDelete);
      }

      toast.success("Quiz agendado com sucesso!");
      setFormData({
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
      fetchQuizzes();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este quiz?")) return;
    
    try {
      const { error } = await supabase
        .from("quiz_agendados")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      toast.success("Quiz excluído.");
      fetchQuizzes();
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    }
  };

  if (loading) return <ModulePageSkeleton variant="form" />;

  return (
    <div className="nexo-scope space-y-4">
      <div id="module-header-title" style={{ display: "none" }}>
        vMix — Quiz
      </div>

      <div className="flex justify-between items-center bg-white/50 backdrop-blur-md p-4 rounded-3xl border border-white/20">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="text-[#C6F03C]" /> Gerenciamento de Quizzes
        </h2>
        <Button 
          onClick={() => setShowForm(!showForm)}
          className="bg-[#C6F03C] hover:bg-[#C6F03C]/90 text-black rounded-full px-6"
        >
          {showForm ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {showForm ? "Cancelar" : "Novo Quiz"}
        </Button>
      </div>

      {showForm && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300 p-6 bg-white rounded-3xl border border-[#C6F03C]/20 shadow-xl space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase opacity-60 block mb-1">Pergunta</label>
                <Input 
                  value={formData.pergunta}
                  onChange={e => setFormData(prev => ({ ...prev, pergunta: e.target.value }))}
                  placeholder="Qual o nome do primeiro álbum dos Beatles?"
                  className="rounded-xl border-[#C6F03C]/20"
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(idx => (
                  <div key={idx}>
                    <label className="text-xs font-bold uppercase opacity-60 block mb-1">
                      Resposta {idx} {idx > 2 && "(Opcional)"}
                    </label>
                    <div className="flex gap-2">
                      <Input 
                        value={(formData as any)[`resposta${idx}`]}
                        onChange={e => setFormData(prev => ({ ...prev, [`resposta${idx}`]: e.target.value }))}
                        className={`rounded-xl border-[#C6F03C]/20 ${formData.resposta_correta === idx ? 'ring-2 ring-[#C6F03C]' : ''}`}
                      />
                      <button 
                        onClick={() => setFormData(prev => ({ ...prev, resposta_correta: idx }))}
                        className={`px-3 rounded-xl border text-[10px] font-bold transition-all ${
                          formData.resposta_correta === idx 
                          ? 'bg-[#C6F03C] border-[#C6F03C] text-black' 
                          : 'border-gray-200 text-gray-400 hover:border-[#C6F03C]/50'
                        }`}
                      >
                        CORRETA
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="text-xs font-bold uppercase opacity-60 block mb-1">Explicação / Curiosidade (Opcional)</label>
                <Input 
                  value={formData.explicacao}
                  onChange={e => setFormData(prev => ({ ...prev, explicacao: e.target.value }))}
                  placeholder="O álbum Please Please Me foi gravado em apenas um dia..."
                  className="rounded-xl border-[#C6F03C]/20"
                />
              </div>
            </div>

            <div className="space-y-4 p-4 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <h3 className="text-sm font-bold flex items-center gap-2 mb-2">
                <CalendarPlus size={16} className="text-[#C6F03C]" /> Agendamento
              </h3>
              
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase opacity-60 block mb-1">Data do Quiz</label>
                  <Input 
                    type="date"
                    value={formData.data_quiz}
                    onChange={e => setFormData(prev => ({ ...prev, data_quiz: e.target.value }))}
                    className="rounded-xl border-[#C6F03C]/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase opacity-60 block mb-1">Início</label>
                    <Input 
                      type="time"
                      value={formData.horario_inicio}
                      onChange={e => setFormData(prev => ({ ...prev, horario_inicio: e.target.value }))}
                      className="rounded-xl border-[#C6F03C]/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase opacity-60 block mb-1">Fim</label>
                    <Input 
                      type="time"
                      value={formData.horario_fim}
                      onChange={e => setFormData(prev => ({ ...prev, horario_fim: e.target.value }))}
                      className="rounded-xl border-[#C6F03C]/20"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button 
              disabled={saving}
              onClick={handleSave}
              className="bg-[#C6F03C] hover:bg-[#C6F03C]/90 text-black rounded-full px-8 py-6 text-lg font-bold shadow-lg"
            >
              {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
              Salvar e Agendar Quiz
            </Button>
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
                <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none", textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {quizzes.length > 0 ? quizzes.map((q, idx) => (
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
              )) : (
                <tr>
                  <td colSpan={4} style={{ padding: "48px 0", textAlign: "center", color: "#64748B" }}>
                    <HelpCircle size={48} className="mx-auto mb-3 opacity-20" />
                    <p style={{ fontSize: 14, fontWeight: 500 }}>Nenhum quiz agendado no momento.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {user && xmlUrl && (
        <XmlSection title="Integração vMix">
          <XmlLinkRow label="XML QUIZ" permanentUrl={xmlUrl} />
        </XmlSection>
      )}
    </div>
  );
}