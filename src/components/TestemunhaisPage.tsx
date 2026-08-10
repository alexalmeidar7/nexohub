import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Upload, ImageIcon, Pencil, X, Save, MessageSquareQuote, Bold, Italic, Underline, Palette } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { confirmDialog } from "@/lib/confirmDialog";

const CYAN = "#00BFF0";
const CARD_BG = "#D6F4FB";
const DARK = "#0A2540";

interface Testemunhal {
  id: string;
  texto: string;
  data_inicio: string;
  data_fim: string;
}

export default function TestemunhaisPage({ effectiveUserId }: { effectiveUserId?: string | null }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Testemunhal[]>([]);
  const ownerId = effectiveUserId || user?.id;

  useEffect(() => {
    if (ownerId) {
      supabase
        .from("testemunhais")
        .select("*")
        .eq("user_id", ownerId)
        .order("data_fim")
        .then(({ data }) => {
          if (data) setItems(data as Testemunhal[]);
          setLoading(false);
        });
    }
  }, [ownerId]);

  if (loading) return <ModulePageSkeleton variant="form" />;

  return (
    <div className="nexo-scope space-y-4">
      <div id="module-header-title" style={{ display: "none" }}>
        ADS — Citações
      </div>
      <div className="animate-fade-in p-6 bg-[#D6F4FB]/50 backdrop-blur-md rounded-3xl border border-[#00BFF0]/20">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <MessageSquareQuote className="text-[#00BFF0]" /> Citações
        </h2>
        <div className="space-y-3">
          {items.map(i => (
            <div key={i.id} className="p-4 bg-white rounded-2xl shadow-sm border border-[#00BFF0]/10">
              <div dangerouslySetInnerHTML={{ __html: i.texto }} className="text-sm text-[#0A2540]" />
              <p className="text-[10px] uppercase font-bold text-[#00BFF0] mt-2">
                Validade: {new Date(i.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')} - {new Date(i.data_fim + 'T12:00:00').toLocaleDateString('pt-BR')}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
