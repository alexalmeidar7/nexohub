import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Radio, Database, Music, Server, Check } from "lucide-react";
import { toast } from "sonner";

export default function InfoMusicSourceSelector() {
  const { user } = useAuth();
  const [source, setSource] = useState<string>("auto");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("infomusic_source")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.infomusic_source) {
        setSource(data.infomusic_source);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const updateSource = async (val: string) => {
    if (!user) return;
    setSource(val);
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: user.id, infomusic_source: val }, { onConflict: "user_id" });
    
    if (error) {
      toast.error("Erro ao atualizar fonte");
    } else {
      toast.success("Fonte de dados atualizada");
      // Trigger a refresh of the broadcast XML if needed
      try { window.dispatchEvent(new Event("infomusic-source-changed")); } catch {}
    }
  };

  const options = [
    { id: "auto", label: "Automático (IA + Banco)", icon: Music, desc: "Prioriza IA e busca no banco local." },
    { id: "jornalfm", label: "Jornal FM (Txt)", icon: Server, desc: "Leitura via arquivo txt do estúdio." },
    { id: "culturafm", label: "Cultura FM (XML)", icon: Radio, desc: "Sincronização via XML externo." },
    { id: "database", label: "Apenas Banco", icon: Database, desc: "Busca apenas curiosidades já salvas." },
  ];

  if (loading) return <div className="h-20 animate-pulse bg-slate-50 rounded-xl" />;

  return (
    <div className="space-y-3">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
        Fonte de Dados da Música
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {options.map((opt) => {
          const active = source === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => updateSource(opt.id)}
              className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-left group relative ${
                active 
                  ? "border-cyan-500 bg-cyan-50/50" 
                  : "border-slate-100 bg-white hover:border-slate-200"
              }`}
            >
              <div className={`p-2 rounded-lg shrink-0 ${active ? "bg-cyan-500 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"}`}>
                <opt.icon size={16} />
              </div>
              <div className="min-w-0">
                <div className={`text-xs font-bold leading-none mb-1 ${active ? "text-cyan-700" : "text-slate-700"}`}>
                  {opt.label}
                </div>
                <div className="text-[10px] text-slate-500 leading-tight">
                  {opt.desc}
                </div>
              </div>
              {active && (
                <div className="absolute top-2 right-2 text-cyan-500">
                  <Check size={12} strokeWidth={3} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
