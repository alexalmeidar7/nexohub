import { useState, useEffect, useRef, useCallback } from "react";
import { HelpCircle, Loader2, CalendarPlus, Save, Trash2, Pencil, Sparkles, Plus, X, Wand2, ImageIcon, Download, Upload, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import XmlLinkRow from "./XmlLinkRow";
import XmlSection from "./XmlSection";
import { toast } from "sonner";
import { todayInBrasilia } from "@/lib/brasiliaDate";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

/* ── pre-built enquete bank ── */
interface QuizItem {
  pergunta: string;
  respostas: [string, string, string, string];
}
const QUIZ_BANK: Record<string, QuizItem[]> = {
  "Música Sertaneja": [
    { pergunta: "Qual dupla gravou 'Evidências'?", respostas: ["Chitãozinho & Xororó", "Zezé Di Camargo & Luciano", "Bruno & Marrone", "Leandro & Leonardo"] },
    { pergunta: "Quem canta 'Boate Azul'?", respostas: ["Milionário & José Rico", "Bruno & Marrone", "Daniel", "Leonardo"] },
  ],
  "Política": [
    { pergunta: "Quem foi o 1º presidente do Brasil?", respostas: ["Deodoro da Fonseca", "Floriano Peixoto", "Prudente de Morais", "Campos Sales"] },
  ],
};
const DEFAULT_CATEGORIES = Object.keys(QUIZ_BANK);

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
  const [enquetes, setEnquetes] = useState<EnqueteAgendada[]>([]);
  const xmlUrl = user ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-xml-enquete?user_id=${user.id}` : "";

  useEffect(() => {
    if (user) {
      supabase
        .from("enquetes_agendadas")
        .select("*")
        .eq("user_id", user.id)
        .order("data_enquete", { ascending: true })
        .then(({ data }) => {
          if (data) setEnquetes(data as EnqueteAgendada[]);
          setLoading(false);
        });
    }
  }, [user]);

  if (loading) return <ModulePageSkeleton variant="form" />;

  return (
    <div className="nexo-scope space-y-4">
      <div id="module-header-title" style={{ display: "none" }}>
        Enquete
      </div>
      <div className="animate-fade-in p-6 bg-white/50 backdrop-blur-md rounded-3xl border border-white/20">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Tag className="text-[#00BFF0]" /> Enquetes Agendadas
        </h2>
        <div className="space-y-3">
          {enquetes.length > 0 ? enquetes.map(e => (
            <div key={e.id} className="p-4 bg-white rounded-2xl shadow-sm border border-[#00BFF0]/10">
              <p className="font-bold text-[#0A2540]">{e.pergunta}</p>
              <p className="text-xs text-[#0A2540]/60">{new Date(e.data_enquete + 'T12:00:00').toLocaleDateString('pt-BR')} | {e.horario_inicio} - {e.horario_fim}</p>
            </div>
          )) : <p className="text-sm text-gray-500">Nenhuma enquete agendada.</p>}
        </div>
      </div>
      {user && xmlUrl && (
        <XmlSection title="XML Enquete">
          <XmlLinkRow label="XML ENQUETE" permanentUrl={xmlUrl} />
        </XmlSection>
      )}
    </div>
  );
}
