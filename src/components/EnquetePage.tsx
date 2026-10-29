import { useState, useEffect } from "react";
import { Tag, Plus, Trash2, CalendarPlus, Save, Loader2, X, HelpCircle, ExternalLink, Radio, StopCircle, Copy, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { todayInBrasilia } from "@/lib/brasiliaDate";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { confirmDialog } from "@/lib/confirmDialog";
import { findClientAccountByEmail, findClientAccountById } from "@/lib/clientAuthAccounts";
import { getScheduleStatus, isScheduleActive, getBrasiliaDateTime, buildEnqueteXml, getActiveEnquete } from "@/lib/scheduledItemUtils";
import initialEnquetesSync from "@/data/xml_enquetes_sync.json";

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

  const postEnqueteFn = async (payload: Record<string, unknown>) => {
    try {
      const { error } = await supabase.functions.invoke("serve-xml-enquete", { body: payload });
      if (error) console.warn("Erro ao sincronizar enquete com a Edge Function:", error);
    } catch (error) {
      console.warn("Erro ao chamar a Edge Function da enquete:", error);
    }
  };

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

      // Sincroniza imediatamente com a função de XML para vMix (banco = fonte do XML)
      void postEnqueteFn({ action: "sync", slug: targetSlug, user_id: uId, enquetes: list });
    } catch {}
  };

  const fetchEnquetes = async () => {
    if (!targetUserId) return;
    let rows: EnqueteAgendada[] = [];
    let databaseLoaded = false;
    try {
      const { data, error } = await supabase.from("enquetes_agendadas")
        .select("*").eq("user_id", targetUserId).order("data_enquete", { ascending: false });
      if (error) throw error;
      rows = (data || []) as EnqueteAgendada[];
      databaseLoaded = true;
    } catch (err) {
      console.warn("Supabase fetch enquetes warning:", err);
    }

    let merged: EnqueteAgendada[] = [];
    if (databaseLoaded) {
      merged = rows;
    } else {
      let serverEnquetes: EnqueteAgendada[] = [];
      try {
        const resp = await fetch("/api/sync-xml-enquete?slug=" + encodeURIComponent(targetSlug) + "&userId=" + encodeURIComponent(targetUserId));
        if (resp.ok) {
          const json = await resp.json();
          if (Array.isArray(json?.enquetes)) serverEnquetes = json.enquetes;
        }
      } catch {}
      const localList = getStoredEnquetes(targetUserId);
      const hasFallbackData = serverEnquetes.length > 0 || localList.length > 0;
      const staticList = hasFallbackData ? [] : (
        (initialEnquetesSync as Record<string, any[]>)[targetSlug] ||
        (initialEnquetesSync as Record<string, any[]>)[targetUserId] || []
      );
      const map = new Map<string, EnqueteAgendada>();
      staticList.forEach(item => item?.id && map.set(item.id, item));
      serverEnquetes.forEach(item => item?.id && map.set(item.id, item));
      localList.forEach(item => item?.id && map.set(item.id, { ...(map.get(item.id) || {}), ...item }));
      merged = Array.from(map.values());
    }

    merged.sort((a, b) => {
      const dateCmp = (b.data_enquete || "").localeCompare(a.data_enquete || "");
      if (dateCmp !== 0) return dateCmp;
      return (b.horario_inicio || "").localeCompare(a.horario_inicio || "");
    });
    setEnquetes(merged);
    saveStoredEnquetes(targetUserId, merged);
    setLoading(false);
  };

  const handleCopyXml = () => {
    const { today, currentTime } = getBrasiliaDateTime();
    const active = getActiveEnquete(enquetes, today, currentTime, true);
    const stationName = clientAcc?.nome || "Positiva FM 99.1";
    const xml = buildEnqueteXml(active, stationName);
    navigator.clipboard.writeText(xml.trim());
    toast.success("XML da Enquete copiado com sucesso!");
  };

  const handleDownloadXml = () => {
    const { today, currentTime } = getBrasiliaDateTime();
    const active = getActiveEnquete(enquetes, today, currentTime, true);
    const stationName = clientAcc?.nome || "Positiva FM 99.1";
    const xml = buildEnqueteXml(active, stationName);
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "enquete.xml";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Arquivo enquete.xml baixado com sucesso!");
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
    try {
      const { data, error } = await supabase.from("enquetes_agendadas")
        .insert([{ ...formData, user_id: targetUserId }])
        .select("id")
        .single();
      if (error) throw error;
      if (!data?.id) throw new Error("O banco não confirmou o cadastro da enquete.");

      const newEnquete: EnqueteAgendada = { id: data.id, ...formData };
      const updated = [newEnquete, ...enquetes.filter(e => e.id !== data.id)];
      setEnquetes(updated);
      saveStoredEnquetes(targetUserId, updated);
      setFormData({
        pergunta: "", resposta1: "", resposta2: "", resposta3: "", resposta4: "",
        resposta_correta: 1, data_enquete: todayInBrasilia(),
        horario_inicio: "00:00", horario_fim: "23:59",
      });
      toast.success("Enquete cadastrada no banco com sucesso!");
    } catch (err: any) {
      console.error("Falha ao salvar enquete:", err);
      toast.error("Enquete não foi salva: " + (err?.message || "falha ao gravar no banco."));
    } finally {
      setSaving(false);
    }
  };

  const handlePutOnAir = async (item: EnqueteAgendada) => {
    if (!targetUserId) return;
    const { today, currentTime } = getBrasiliaDateTime();
    const currentList = enquetes;
    const updated = currentList.map(e => {
      if (e.id === item.id) return { ...e, data_enquete: today, horario_inicio: "00:00", horario_fim: "23:59" };
      if (getScheduleStatus(e.data_enquete, e.horario_inicio, e.horario_fim) === "active") return { ...e, horario_fim: currentTime };
      return e;
    });
    if (!updated.some(e => e.id === item.id)) updated.unshift({ ...item, data_enquete: today, horario_inicio: "00:00", horario_fim: "23:59" });
    try {
      for (const next of updated) {
        const previous = currentList.find(e => e.id === next.id);
        if (!previous || (previous.data_enquete === next.data_enquete && previous.horario_inicio === next.horario_inicio && previous.horario_fim === next.horario_fim)) continue;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(next.id);
        if (!isUuid) continue;
        const { data, error } = await supabase.from("enquetes_agendadas")
          .update({ data_enquete: next.data_enquete, horario_inicio: next.horario_inicio, horario_fim: next.horario_fim })
          .eq("id", next.id).eq("user_id", targetUserId).select("id").maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error("O banco não confirmou a alteração de horário da enquete.");
      }
      setEnquetes(updated);
      saveStoredEnquetes(targetUserId, updated);
      toast.success("Enquete colocada no ar agora! XML atualizado no vMix.");
    } catch (err: any) {
      toast.error("Não foi possível colocar a enquete no ar: " + (err?.message || "falha ao atualizar o banco."));
    }
  };

  const handleTakeOffAir = async (item: EnqueteAgendada) => {
    if (!targetUserId) return;
    const { today, currentTime } = getBrasiliaDateTime();
    const parts = currentTime.split(":").map(Number);
    const totalMin = (parts[0] || 0) * 60 + (parts[1] || 0) - 1;
    let newEnd = "00:00";
    let newDate = today;
    if (totalMin <= 0) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      newDate = d.toISOString().slice(0, 10);
      newEnd = "23:59";
    } else {
      newEnd = String(Math.floor(totalMin / 60)).padStart(2, "0") + ":" + String(totalMin % 60).padStart(2, "0");
    }
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id);
      if (isUuid) {
        const { data, error } = await supabase.from("enquetes_agendadas")
          .update({ data_enquete: newDate, horario_fim: newEnd })
          .eq("id", item.id).eq("user_id", targetUserId).select("id").maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error("O banco não confirmou o encerramento da enquete.");
      }
      const updatedItem = { ...item, data_enquete: newDate, horario_fim: newEnd };
      const updated = enquetes.map(e => e.id === item.id ? updatedItem : e);
      setEnquetes(updated);
      saveStoredEnquetes(targetUserId, updated);
      toast.success("Enquete tirada do ar! XML desativado no vMix.");
    } catch (err: any) {
      toast.error("Não foi possível tirar a enquete do ar: " + (err?.message || "falha ao atualizar o banco."));
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDialog({
      title: "Excluir Enquete",
      message: "Tem certeza que deseja excluir esta enquete?",
      destructive: true,
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
    });
    if (!confirmed || !targetUserId) return;
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid) {
        const { data, error } = await supabase.from("enquetes_agendadas")
          .delete().eq("id", id).eq("user_id", targetUserId).select("id").maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error("O banco não confirmou a exclusão da enquete.");
      }
      const updated = enquetes.filter(e => e.id !== id);
      setEnquetes(updated);
      saveStoredEnquetes(targetUserId, updated);
      toast.success("Enquete excluída com sucesso.");
    } catch (err: any) {
      toast.error("Enquete não foi excluída: " + (err?.message || "falha ao excluir no banco."));
    }
  };

  const handleReuse = (item: EnqueteAgendada) => {
    setFormData({
      pergunta: item.pergunta || "",
      resposta1: item.resposta1 || "",
      resposta2: item.resposta2 || "",
      resposta3: item.resposta3 || "",
      resposta4: item.resposta4 || "",
      resposta_correta: item.resposta_correta || 1,
      data_enquete: todayInBrasilia(),
      horario_inicio: "00:00",
      horario_fim: "23:59",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.success("Enquete carregada no formulário. Ajuste a data/horário e salve para agendar novamente.");
  };

  // Separa enquetes: próximas/ativas vs encerradas (máx. 50 exibidas)
  const proximasEnquetes = enquetes.filter(e => getScheduleStatus(e.data_enquete, e.horario_inicio, e.horario_fim) !== "expired");
  const encerradasEnquetes = enquetes
    .filter(e => getScheduleStatus(e.data_enquete, e.horario_inicio, e.horario_fim) === "expired")
    .slice(0, 50);

  if (loading) return <ModulePageSkeleton variant="form" />;

  return (
    <div className="nexo-scope space-y-4 w-full max-w-none mx-0">
      <div id="module-header-title" style={{ display: "none" }}>
        vMix — Enquete
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
            Total: <span style={{ color: "#00BFF0" }}>{proximasEnquetes.length}</span>
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
              {proximasEnquetes.length > 0 ? proximasEnquetes.map((e, idx) => {
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
                      <div className="flex items-center justify-end gap-2">
                        {status === "active" ? (
                          <button
                            onClick={() => handleTakeOffAir(e)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-600 hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer"
                            title="Tirar esta enquete do ar e limpar o XML no vMix"
                          >
                            <StopCircle size={13} />
                            TIRAR DO AR
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePutOnAir(e)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 hover:bg-emerald-600 hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer"
                            title="Colocar esta enquete no ar agora no XML"
                          >
                            <Radio size={13} />
                            NO AR
                          </button>
                        )}
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
                      </div>
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

      {encerradasEnquetes.length > 0 && (
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
              <StopCircle size={24} style={{ color: "#94A3B8" }} />
              Enquetes Encerradas
            </h2>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#0A2540",
                background: "#F1F5F9",
                padding: "6px 16px",
                borderRadius: 999,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Total: <span style={{ color: "#64748B" }}>{encerradasEnquetes.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto" style={{ borderRadius: 24, border: "1px solid #E2E8F0" }}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ background: "#64748B" }}>
                  <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none" }}>Data / Horário</th>
                  <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none" }}>Pergunta</th>
                  <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none" }}>Opções</th>
                  <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none", textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {encerradasEnquetes.map((e, idx) => (
                  <tr
                    key={e.id}
                    style={{ background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC", transition: "background 0.2s ease" }}
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
                          <span key={i} style={{ padding: "2px 8px", background: "#F1F5F9", borderRadius: 999, fontSize: 10, color: "#475569", fontWeight: 600 }}>
                            {resp}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: "14px 20px", textAlign: "right" }}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleReuse(e)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-blue-50 text-[#0055ff] border border-blue-200/80 hover:bg-[#0055ff] hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer"
                          title="Reutilizar esta enquete: carrega os dados no formulário para agendar novamente"
                        >
                          <Copy size={13} />
                          USAR NOVAMENTE
                        </button>
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}