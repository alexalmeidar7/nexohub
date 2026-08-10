import { useState, useEffect } from "react";
import { HelpCircle, Loader2, CalendarPlus, Save, Trash2, Pencil, Sparkles, Plus, X, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import XmlLinkRow from "./XmlLinkRow";
import XmlSection from "./XmlSection";
import { toast } from "sonner";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

interface QuizAgendado {
  id: string;
  pergunta: string;
  data_quiz: string;
}

export default function QuizPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState<QuizAgendado[]>([]);
  const xmlUrl = user ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-xml-quiz?user_id=${user.id}` : "";

  useEffect(() => {
    if (user) {
      supabase
        .from("quiz_agendados")
        .select("*")
        .eq("user_id", user.id)
        .order("data_quiz", { ascending: true })
        .then(({ data }) => {
          if (data) setQuizzes(data as QuizAgendado[]);
          setLoading(false);
        });
    }
  }, [user]);

  if (loading) return <ModulePageSkeleton variant="form" />;

  return (
    <div className="nexo-scope space-y-4">
      <div id="module-header-title" style={{ display: "none" }}>
        Quiz
      </div>
      <div className="animate-fade-in p-6 bg-white/50 backdrop-blur-md rounded-3xl border border-white/20">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Sparkles className="text-[#C6F03C]" /> Quizzes Agendados
        </h2>
        <div className="space-y-3">
          {quizzes.length > 0 ? quizzes.map(q => (
            <div key={q.id} className="p-4 bg-white rounded-2xl shadow-sm border border-[#C6F03C]/20">
              <p className="font-bold text-[#0A2540]">{q.pergunta}</p>
              <p className="text-xs text-gray-500">{new Date(q.data_quiz + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
            </div>
          )) : <p className="text-sm text-gray-500">Nenhum quiz agendado.</p>}
        </div>
      </div>
      {user && xmlUrl && (
        <XmlSection title="XML Quiz">
          <XmlLinkRow label="XML QUIZ" permanentUrl={xmlUrl} />
        </XmlSection>
      )}
    </div>
  );
}
