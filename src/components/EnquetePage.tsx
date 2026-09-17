import { useState, useEffect } from "react";
import { Tag, Plus, Trash2, CalendarPlus, Save, Loader2, X, HelpCircle, ExternalLink, Radio } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { todayInBrasilia } from "@/lib/brasiliaDate";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { confirmDialog } from "@/lib/confirmDialog";
import { findClientAccountByEmail, findClientAccountById } from "@/lib/clientAuthAccounts";
import { getScheduleStatus, isScheduleActive, getBrasiliaDateTime } from "@/lib/scheduledItemUtils";

interface EnqueteAgendada {
  id: string;
  pergunta: string;
  resposta1: string;
  resposta2: string;
  resposta3: string;
  resposta4: string;
  resposta_correta: number;
  data_enquete: string;
  horario_inicio: string;
  horario_fim: string;
}

export default function EnquetePage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const clientAcc = findClientAccountByEmail(user?.email || "") || findClientAccountById(user?.id || "");
  const targetUserId = effectiveUserId || clientAcc?.parentUserId || clientAcc?.id || user?.id;
  const targetSlug = clientAcc?.slug || (user as any)?.user_metadata?.slug || "positivafm";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enquetes, setEnquetes] = useState<EnqueteAgendada[]>([]);
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
    data_enquete: todayInBrasilia(),
    horario_inicio: "00:00",
    horario_fim: "23:59"
  });

  const getLocalStorageKey = (uId: string) => `nexohub_enquetes_${uId}`;

  const getStoredEnquetes = (uId: string): EnqueteAgendada[] => {
    try {
      const raw = localStorage.getItem(getLocalStorageKey(uId)) || localStorage.getItem(`nexohub_enquetes_${targetSlug}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  };

  const saveStoredEnquetes = (uId: string, list: EnqueteAgendada[]) => {
    try {
      localStorage.setItem(getLocalStorageKey(uId), JSON.stringify(list));
      localStorage.setItem(`nexohub_enquetes_${targetSlug}`, JSON.stringify(list));
      // Sincroniza com o servidor local e endpoints XML em tempo real
      fetch("/api/sync-xml-enquete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: targetSlug, userId: uId, enquetes: list }),
      }).catch(() => {});
    } catch {}
  };

  const fetchEnquetes = async () => {
    if (!targetUserId) return;
    
    const { today, currentTime } = getBrasiliaDateTime();

    let rows: any[] = [];
    try {
      const { data } = await supabase
        .from("enquetes_agendadas")
        .select("*")
        .eq("user_id", targetUserId)
        .order("data_enquete", { ascending: false });

      if (data) {
        rows = data;
      }
    } catch (err) {
      console.warn("Supabase fetch enquetes warning:", err);
    }

    const localList = getStoredEnquetes(targetUserId);
    const map = new Map<string, EnqueteAgendada>();
    rows.forEach(r => map.set(r.id, r));
    localList.forEach(r => map.set(r.id, r));
    const merged = Array.from(map.values());

    // Filtrar apenas as enquetes que ainda não terminaram
    const validEnquetes = merged.filter(e => {
      if (e.data_enquete > today) return true;
      if (e.data_enquete === today && e.horario_fim >= currentTime) return true;
      return false;
    });

    setEnquetes(validEnquetes as EnqueteAgendada[]);
    saveStoredEnquetes(targetUserId, validEnquetes as EnqueteAgendada[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchEnquetes();
  }, [targetUserId]);

  const handleSave = async () => {
    if (!targetUserId) return;
    if (!formData.pergunta || !formData.resposta1 || !formData.resposta2) {
      toast.error("Preencha a pergunta e pelo menos as duas primeiras respostas.");
      return;
    }

    setSaving(true);
    const id = `enq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newEnquete: EnqueteAgendada = {
      id,
      ...formData,
    };

    // Atualiza imediatamente localmente
    const currentList = getStoredEnquetes(targetUserId);
    const updated = [newEnquete, ...currentList.filter(e => e.id !== id)];
    setEnquetes(updated);
    saveStoredEnquetes(targetUserId, updated);

    try {
      const { error } = await supabase
        .from("enquetes_agendadas")
        .insert([{
          ...formData,
          user_id: targetUserId,
        }]);

      if (error) {
        console.warn("Supabase enquete insert warning (mantido localmente):", error.message);
      }
    } catch (err) {
      console.warn("Supabase enquete save network error:", err);
    } finally {
      setSaving(false);
    }

    toast.success("Enquete agendada com sucesso!");
    setShowForm(false);
    setFormData({
      pergunta: "",
      resposta1: "",
      resposta2: "",
      resposta3: "",
      resposta4: "",
      resposta_correta: 1,
      data_enquete: todayInBrasilia(),
      horario_inicio: "00:00",
      horario_fim: "23:59"
    });
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDialog({
      title: "Excluir Enquete",
      message: "Tem certeza que deseja excluir esta enquete?",
      destructive: true,
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar"
    });
    if (!confirmed || !targetUserId) return;
    
    // Atualiza localmente imediatamente
    const currentList = getStoredEnquetes(targetUserId);
    const updated = currentList.filter(e => e.id !== id);
    setEnquetes(updated);
    saveStoredEnquetes(targetUserId, updated);

    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid) {
        await supabase
          .from("enquetes_agendadas")
          .delete()
          .eq("id", id);
      }
    } catch (err) {
      console.warn("Erro ao excluir enquete no Supabase:", err);
    }
    toast.success("Enquete excluída com sucesso.");
  };

  if (loading) return <ModulePageSkeleton variant="form" />;

  return (
    <div className="nexo-scope space-y-4 max-w-6xl mx-auto w-full">
      <div id="module-header-title" style={{ display: "none" }}>
        vMix — Enquete
      </div>

      <div className="flex justify-between items-center bg-white p-5 rounded-3xl border border-slate-200/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-3">
          <div style={{ width: 44, height: 44, borderRadius: 16, background: "#0055ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Tag size={20} color="#fff" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-[#002132]">
              Gerenciamento de Enquetes
            </h2>
            <p className="text-xs text-slate-400 font-medium">Agendamento e controle de enquetes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/xml/${targetSlug}/enquete.xml`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 px-5 rounded-full font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-[#0055ff] border border-slate-200/80 transition shadow-sm"
            title="Abrir feed XML da Enquete no navegador ou vMix"
          >
            <ExternalLink size={15} className="text-[#0055ff]" />
            <span>XML ENQUETE</span>
          </a>
          <button 
            onClick={() => setShowForm(!showForm)}
            className={`h-11 px-6 rounded-full font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all cursor-pointer ${
              showForm ? "bg-slate-100 hover:bg-slate-200 text-slate-700" : "bg-[#0055ff] hover:bg-[#0047d4] text-white shadow-md hover:shadow-blue-500/20"
            }`}
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancelar" : "Nova Enquete"}
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
                  placeholder="Qual sua música favorita?"
                  className="rounded-full h-11 bg-[#f8fafc] border-slate-200/90 text-xs font-semibold uppercase px-5 focus:bg-white focus:border-[#0055ff]"
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748b] block mb-1.5">Resposta 1</label>
                  <Input 
                    value={formData.resposta1}
                    onChange={e => setFormData(prev => ({ ...prev, resposta1: e.target.value }))}
                    className="rounded-full h-11 bg-[#f8fafc] border-slate-200/90 text-xs font-semibold uppercase px-5 focus:bg-white focus:border-[#0055ff]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748b] block mb-1.5">Resposta 2</label>
                  <Input 
                    value={formData.resposta2}
                    onChange={e => setFormData(prev => ({ ...prev, resposta2: e.target.value }))}
                    className="rounded-full h-11 bg-[#f8fafc] border-slate-200/90 text-xs font-semibold uppercase px-5 focus:bg-white focus:border-[#0055ff]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748b] block mb-1.5">Resposta 3 (Opcional)</label>
                  <Input 
                    value={formData.resposta3}
                    onChange={e => setFormData(prev => ({ ...prev, resposta3: e.target.value }))}
                    className="rounded-full h-11 bg-[#f8fafc] border-slate-200/90 text-xs font-semibold uppercase px-5 focus:bg-white focus:border-[#0055ff]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748b] block mb-1.5">Resposta 4 (Opcional)</label>
                  <Input 
                    value={formData.resposta4}
                    onChange={e => setFormData(prev => ({ ...prev, resposta4: e.target.value }))}
                    className="rounded-full h-11 bg-[#f8fafc] border-slate-200/90 text-xs font-semibold uppercase px-5 focus:bg-white focus:border-[#0055ff]"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 p-5 bg-[#f8fafc] rounded-2xl border border-slate-200/80">
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2 mb-2 text-[#002132]">
                <CalendarPlus size={16} className="text-[#0055ff]" /> Agendamento
              </h3>
              
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748b] block mb-1.5">Data da Enquete</label>
                  <Input 
                    type="date"
                    value={formData.data_enquete}
                    onChange={e => setFormData(prev => ({ ...prev, data_enquete: e.target.value }))}
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
              Salvar e Agendar Enquete
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
            Próximas Enquetes
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
            Total: <span style={{ color: "#00BFF0" }}>{enquetes.length}</span>
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
              {enquetes.length > 0 ? enquetes.map((e, idx) => {
                const status = getScheduleStatus(e.data_enquete, e.horario_inicio, e.horario_fim);
                return (
                  <tr
                    key={e.id}
                    style={{
                      background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC",
                      transition: "background 0.2s ease"
                    }}
                    className="hover:bg-[#F1F5F9]"
                  >
                    <td style={{ padding: "14px 20px", fontSize: 13, color: "#0A2540" }}>
                      <div className="flex flex-col">
                        <span style={{ fontWeight: 700 }}>
                          {new Date(e.data_enquete + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </span>
                        <span style={{ fontSize: 10, opacity: 0.6 }}>
                          {e.horario_inicio} - {e.horario_fim}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 13, fontWeight: 500, color: "#0A2540" }}>
                      {e.pergunta}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 13, color: "#0A2540" }}>
                      <div className="flex flex-wrap gap-2">
                        {[e.resposta1, e.resposta2, e.resposta3, e.resposta4].filter(Boolean).map((resp, i) => (
                          <span key={i} style={{ padding: "2px 8px", background: "#D6F4FB", borderRadius: 999, fontSize: 10, color: "#0A2540", fontWeight: 600 }}>
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
                          AGENDADA
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500">
                          ENCERRADA
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "14px 20px", textAlign: "right" }}>
                      <button
                        onClick={() => handleDelete(e.id)}
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
                    <p style={{ fontSize: 14, fontWeight: 500 }}>Nenhuma enquete agendada no momento.</p>
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