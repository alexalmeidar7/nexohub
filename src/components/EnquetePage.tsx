import { useState, useEffect } from "react";
import { Tag, Plus, Trash2, CalendarPlus, Save, Loader2, X, HelpCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import XmlLinkRow from "./XmlLinkRow";
import XmlSection from "./XmlSection";
import { toast } from "sonner";
import { todayInBrasilia } from "@/lib/brasiliaDate";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

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

export default function EnquetePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enquetes, setEnquetes] = useState<EnqueteAgendada[]>([]);
  const [showForm, setShowForm] = useState(true);
  
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

  const xmlUrl = user ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-xml-enquete?user_id=${user.id}` : "";

  const fetchEnquetes = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("enquetes_agendadas")
      .select("*")
      .eq("user_id", user.id)
      .order("data_enquete", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar enquetes");
    } else {
      setEnquetes(data as EnqueteAgendada[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEnquetes();
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
        .from("enquetes_agendadas")
        .insert([{
          ...formData,
          user_id: user.id
        }]);

      if (error) throw error;
      
      // Cleanup: Keep only last 20 polls
      const { data: latestEnquetes } = await supabase
        .from("enquetes_agendadas")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      if (latestEnquetes && latestEnquetes.length > 20) {
        const idsToDelete = latestEnquetes.slice(20).map(e => e.id);
        await supabase
          .from("enquetes_agendadas")
          .delete()
          .in("id", idsToDelete);
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
      fetchEnquetes();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta enquete?")) return;
    
    try {
      const { error } = await supabase
        .from("enquetes_agendadas")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      toast.success("Enquete excluída.");
      fetchEnquetes();
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    }
  };

  if (loading) return <ModulePageSkeleton variant="form" />;

  return (
    <div className="nexo-scope space-y-4">
      <div id="module-header-title" style={{ display: "none" }}>
        vMix — Enquete
      </div>

      <div className="flex justify-between items-center bg-white/50 backdrop-blur-md p-4 rounded-3xl border border-white/20">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Tag className="text-[#00BFF0]" /> Gerenciamento de Enquetes
        </h2>
        <Button 
          onClick={() => setShowForm(!showForm)}
          className="bg-[#00BFF0] hover:bg-[#00BFF0]/90 text-white rounded-full px-6"
        >
          {showForm ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {showForm ? "Cancelar" : "Nova Enquete"}
        </Button>
      </div>

      {showForm && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300 p-6 bg-white rounded-3xl border border-[#00BFF0]/20 shadow-xl space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase opacity-60 block mb-1">Pergunta</label>
                <Input 
                  value={formData.pergunta}
                  onChange={e => setFormData(prev => ({ ...prev, pergunta: e.target.value }))}
                  placeholder="Qual sua música favorita?"
                  className="rounded-xl border-[#00BFF0]/20"
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase opacity-60 block mb-1">Resposta 1</label>
                  <Input 
                    value={formData.resposta1}
                    onChange={e => setFormData(prev => ({ ...prev, resposta1: e.target.value }))}
                    className="rounded-xl border-[#00BFF0]/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase opacity-60 block mb-1">Resposta 2</label>
                  <Input 
                    value={formData.resposta2}
                    onChange={e => setFormData(prev => ({ ...prev, resposta2: e.target.value }))}
                    className="rounded-xl border-[#00BFF0]/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase opacity-60 block mb-1">Resposta 3 (Opcional)</label>
                  <Input 
                    value={formData.resposta3}
                    onChange={e => setFormData(prev => ({ ...prev, resposta3: e.target.value }))}
                    className="rounded-xl border-[#00BFF0]/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase opacity-60 block mb-1">Resposta 4 (Opcional)</label>
                  <Input 
                    value={formData.resposta4}
                    onChange={e => setFormData(prev => ({ ...prev, resposta4: e.target.value }))}
                    className="rounded-xl border-[#00BFF0]/20"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 p-4 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <h3 className="text-sm font-bold flex items-center gap-2 mb-2">
                <CalendarPlus size={16} className="text-[#00BFF0]" /> Agendamento
              </h3>
              
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase opacity-60 block mb-1">Data da Enquete</label>
                  <Input 
                    type="date"
                    value={formData.data_enquete}
                    onChange={e => setFormData(prev => ({ ...prev, data_enquete: e.target.value }))}
                    className="rounded-xl border-[#00BFF0]/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase opacity-60 block mb-1">Início</label>
                    <Input 
                      type="time"
                      value={formData.horario_inicio}
                      onChange={e => setFormData(prev => ({ ...prev, horario_inicio: e.target.value }))}
                      className="rounded-xl border-[#00BFF0]/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase opacity-60 block mb-1">Fim</label>
                    <Input 
                      type="time"
                      value={formData.horario_fim}
                      onChange={e => setFormData(prev => ({ ...prev, horario_fim: e.target.value }))}
                      className="rounded-xl border-[#00BFF0]/20"
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
              className="bg-[#00BFF0] hover:bg-[#00BFF0]/90 text-white rounded-full px-8 py-6 text-lg font-bold shadow-lg"
            >
              {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
              Salvar e Agendar Enquete
            </Button>
          </div>
        </div>
      )}

      <div className="animate-fade-in p-6 bg-white/50 backdrop-blur-md rounded-3xl border border-white/20">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
          <CalendarPlus className="text-[#00BFF0]" /> Próximas Enquetes
        </h2>
        
        <div className="overflow-hidden bg-white rounded-3xl border border-[#00BFF0]/10 shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-bottom border-gray-100">
                <th className="px-6 py-4 text-[10px] font-bold uppercase text-[#00BFF0] tracking-wider">Data / Horário</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase text-[#00BFF0] tracking-wider">Pergunta</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase text-[#00BFF0] tracking-wider">Opções</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase text-[#00BFF0] tracking-wider w-20 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {enquetes.length > 0 ? enquetes.map(e => (
                <tr key={e.id} className="group hover:bg-[#00BFF0]/5 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-bold text-sm text-[#0A2540]">
                        {new Date(e.data_enquete + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </span>
                      <span className="text-[10px] opacity-60">
                        {e.horario_inicio} - {e.horario_fim}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-sm text-[#0A2540]">{e.pergunta}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      {[e.resposta1, e.resposta2, e.resposta3, e.resposta4].filter(Boolean).map((resp, i) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-100 rounded-full text-[10px] text-gray-600">
                          {resp}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleDelete(e.id)}
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full h-8 w-8"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-gray-400">
                    <HelpCircle size={48} className="mx-auto mb-3 opacity-20" />
                    <p>Nenhuma enquete agendada no momento.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {user && xmlUrl && (
        <XmlSection title="Integração vMix">
          <XmlLinkRow label="XML ENQUETE" permanentUrl={xmlUrl} />
        </XmlSection>
      )}
    </div>
  );
}