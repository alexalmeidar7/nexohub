import { useState, useEffect, useRef, useCallback } from "react";
import { HelpCircle, Loader2, CalendarPlus, Save, Trash2, Pencil, Sparkles, Plus, X, Wand2, ImageIcon, Download, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import XmlLinkRow from "./XmlLinkRow";
import { toast } from "sonner";
/* ── pre-built quiz bank (rotate daily by dayOfYear) ── */
interface QuizItem {
  pergunta: string;
  respostas: [string, string];
  correta: number; // 1-2
}
const QUIZ_BANK: Record<string, QuizItem[]> = {
  "Música Sertaneja": [
    { pergunta: "Qual dupla gravou 'Evidências'?", respostas: ["Chitãozinho & Xororó", "Zezé Di Camargo & Luciano"], correta: 1 },
    { pergunta: "Quem canta 'Boate Azul'?", respostas: ["Milionário & José Rico", "Bruno & Marrone"], correta: 1 },
    { pergunta: "Qual cantor é conhecido como 'Rei do Sertanejo'?", respostas: ["Leonardo", "Daniel"], correta: 1 },
    { pergunta: "Qual dupla gravou 'É o Amor'?", respostas: ["Zezé Di Camargo & Luciano", "Chitãozinho & Xororó"], correta: 1 },
    { pergunta: "Quem canta 'Telefone Mudo'?", respostas: ["Leandro & Leonardo", "Milionário & José Rico"], correta: 1 },
    { pergunta: "Qual artista gravou 'Inventor dos Amores'?", respostas: ["Luan Santana", "Gusttavo Lima"], correta: 1 },
    { pergunta: "Qual dupla é famosa por 'Fio de Cabelo'?", respostas: ["Chitãozinho & Xororó", "Zezé Di Camargo & Luciano"], correta: 1 },
    { pergunta: "Quem gravou 'Ainda Ontem Chorei de Saudade'?", respostas: ["João Paulo & Daniel", "Leandro & Leonardo"], correta: 1 },
    { pergunta: "Qual cantora é conhecida como 'Rainha da Sofrência'?", respostas: ["Marília Mendonça", "Simone Mendes"], correta: 1 },
    { pergunta: "Quem canta 'Amor da Minha Vida'?", respostas: ["Daniel", "Leonardo"], correta: 1 },
    { pergunta: "Qual dupla gravou 'Pense em Mim'?", respostas: ["Leandro & Leonardo", "Chitãozinho & Xororó"], correta: 1 },
    { pergunta: "Quem é o intérprete de 'Tarde Demais'?", respostas: ["Cristiano Araújo", "Gusttavo Lima"], correta: 1 },
    { pergunta: "Qual artista gravou 'Apelido Carinhoso'?", respostas: ["Gusttavo Lima", "Jorge & Mateus"], correta: 1 },
    { pergunta: "Quem canta 'Pot-Pourri do Amor'?", respostas: ["Milionário & José Rico", "Tonico & Tinoco"], correta: 1 },
    { pergunta: "Qual dupla gravou 'Temporal de Amor'?", respostas: ["Leandro & Leonardo", "Bruno & Marrone"], correta: 1 },
  ],
  "Política": [
    { pergunta: "Quem foi o 1º presidente do Brasil?", respostas: ["Deodoro da Fonseca", "Floriano Peixoto"], correta: 1 },
    { pergunta: "Em que ano foi promulgada a Constituição atual?", respostas: ["1988", "1985"], correta: 1 },
    { pergunta: "Quantos senadores cada estado brasileiro elege?", respostas: ["3", "2"], correta: 1 },
    { pergunta: "Quem foi o presidente mais jovem do Brasil?", respostas: ["Fernando Collor", "Jânio Quadros"], correta: 1 },
    { pergunta: "Qual é a idade mínima para ser presidente no Brasil?", respostas: ["35 anos", "30 anos"], correta: 1 },
    { pergunta: "Quantos deputados federais o Brasil possui?", respostas: ["513", "400"], correta: 1 },
    { pergunta: "Quem foi o último presidente militar do Brasil?", respostas: ["João Figueiredo", "Ernesto Geisel"], correta: 1 },
    { pergunta: "Em que ano o voto feminino foi instituído no Brasil?", respostas: ["1932", "1920"], correta: 1 },
    { pergunta: "Qual presidente construiu Brasília?", respostas: ["Juscelino Kubitschek", "Getúlio Vargas"], correta: 1 },
    { pergunta: "Qual é o órgão máximo do Poder Judiciário brasileiro?", respostas: ["STF", "TSE"], correta: 1 },
    { pergunta: "Quantos ministros compõem o STF?", respostas: ["11", "9"], correta: 1 },
    { pergunta: "Quem proclamou a República do Brasil?", respostas: ["Deodoro da Fonseca", "Dom Pedro II"], correta: 1 },
    { pergunta: "Qual presidente sofreu impeachment em 1992?", respostas: ["Fernando Collor", "Itamar Franco"], correta: 1 },
    { pergunta: "Quantos estados o Brasil possui?", respostas: ["26", "24"], correta: 1 },
    { pergunta: "Qual é o mandato de um senador no Brasil?", respostas: ["6 anos", "4 anos"], correta: 1 },
  ],
  "História do Brasil": [
    { pergunta: "Em que ano o Brasil foi descoberto?", respostas: ["1500", "1492"], correta: 1 },
    { pergunta: "Quem liderou a Inconfidência Mineira?", respostas: ["Tiradentes", "Tomás Antônio Gonzaga"], correta: 1 },
    { pergunta: "Em que ano a escravidão foi abolida no Brasil?", respostas: ["1888", "1850"], correta: 1 },
    { pergunta: "Qual tratado dividiu o mundo entre Portugal e Espanha?", respostas: ["Tratado de Tordesilhas", "Tratado de Madrid"], correta: 1 },
    { pergunta: "Quem assinou a Lei Áurea?", respostas: ["Princesa Isabel", "Dom Pedro II"], correta: 1 },
    { pergunta: "Em que ano o Brasil se tornou independente?", respostas: ["1822", "1808"], correta: 1 },
    { pergunta: "Qual foi a primeira capital do Brasil?", respostas: ["Salvador", "Rio de Janeiro"], correta: 1 },
    { pergunta: "Quem liderou a Revolução Farroupilha?", respostas: ["Bento Gonçalves", "Garibaldi"], correta: 1 },
    { pergunta: "Em que ano a família real chegou ao Brasil?", respostas: ["1808", "1800"], correta: 1 },
    { pergunta: "Qual era o nome oficial do Brasil colônia?", respostas: ["Terra de Santa Cruz", "Terra de Vera Cruz"], correta: 1 },
    { pergunta: "Quem gritou 'Independência ou Morte'?", respostas: ["Dom Pedro I", "José Bonifácio"], correta: 1 },
    { pergunta: "Qual revolta ocorreu na Bahia em 1798?", respostas: ["Conjuração Baiana", "Balaiada"], correta: 1 },
    { pergunta: "Em que ano Getúlio Vargas assumiu pela 1ª vez?", respostas: ["1930", "1928"], correta: 1 },
    { pergunta: "Qual foi o primeiro produto de exportação do Brasil?", respostas: ["Pau-Brasil", "Café"], correta: 1 },
    { pergunta: "Em que ano começou a ditadura militar?", respostas: ["1964", "1960"], correta: 1 },
  ],
  "Curiosidades": [
    { pergunta: "Qual é o maior osso do corpo humano?", respostas: ["Fêmur", "Tíbia"], correta: 1 },
    { pergunta: "Quantos litros de sangue o corpo humano possui?", respostas: ["5 litros", "3 litros"], correta: 1 },
    { pergunta: "Qual é o animal mais rápido do mundo?", respostas: ["Falcão-peregrino", "Leopardo"], correta: 1 },
    { pergunta: "Qual planeta é conhecido como Estrela d'Alva?", respostas: ["Vênus", "Marte"], correta: 1 },
    { pergunta: "Quantos dentes tem um adulto?", respostas: ["32", "28"], correta: 1 },
    { pergunta: "Qual é o menor país do mundo?", respostas: ["Vaticano", "Mônaco"], correta: 1 },
    { pergunta: "Qual é o rio mais extenso do mundo?", respostas: ["Amazonas", "Nilo"], correta: 1 },
    { pergunta: "Quantos ossos tem o corpo humano adulto?", respostas: ["206", "186"], correta: 1 },
    { pergunta: "Qual é o elemento químico mais abundante no universo?", respostas: ["Hidrogênio", "Oxigênio"], correta: 1 },
    { pergunta: "Qual é o maior oceano do planeta?", respostas: ["Pacífico", "Atlântico"], correta: 1 },
    { pergunta: "Quantas cores tem o arco-íris?", respostas: ["7", "5"], correta: 1 },
    { pergunta: "Qual é a vitamina do sol?", respostas: ["Vitamina D", "Vitamina A"], correta: 1 },
    { pergunta: "Qual animal é o símbolo da paz?", respostas: ["Pomba", "Águia"], correta: 1 },
    { pergunta: "Quantos fusos horários o Brasil possui?", respostas: ["4", "3"], correta: 1 },
    { pergunta: "Qual o metal mais caro do mundo?", respostas: ["Ródio", "Ouro"], correta: 1 },
  ],
};
const DEFAULT_CATEGORIES = Object.keys(QUIZ_BANK);
function getQuizzesForCategory(category: string, custom: Record<string, QuizItem[]>): QuizItem[] {
  const bank = custom[category] || QUIZ_BANK[category] || [];
  if (bank.length === 0) return [];
  if (custom[category]) return bank.slice(0, 5);
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const startIdx = (dayOfYear * 5) % bank.length;
  const result: QuizItem[] = [];
  for (let i = 0; i < 5; i++) {
    result.push(bank[(startIdx + i) % bank.length]);
  }
  return result;
}
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
interface Programa {
  id: string;
  nome: string;
  dias_semana: string[] | null;
  horario_inicio: string;
  horario_fim: string;
}

export default function EnquetePage() {
  const { user } = useAuth();
  const [pergunta, setPergunta] = useState("");
  const [respostas, setRespostas] = useState(["", ""]);
  const [correta, setCorreta] = useState(1);
  const [dataEnquete, setDataEnquete] = useState("");
  const [horarioInicio, setHorarioInicio] = useState("");
  const [horarioFim, setHorarioFim] = useState("");
  const [enquetes, setEnquetes] = useState<EnqueteAgendada[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [customCategories, setCustomCategories] = useState<Record<string, QuizItem[]>>({});
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [loadingCategory, setLoadingCategory] = useState(false);

  // Auto-schedule state
  const [autoMode, setAutoMode] = useState<"programa" | "custom">("programa");
  const [autoPrograma, setAutoPrograma] = useState("");
  const [autoDiasSemana, setAutoDiasSemana] = useState<string[]>([]);
  const [autoHorarioInicio, setAutoHorarioInicio] = useState("");
  const [autoHorarioFim, setAutoHorarioFim] = useState("");
  const [autoDaysAhead, setAutoDaysAhead] = useState(5);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [programas, setProgramas] = useState<Programa[]>([]);

  // Máscara (Arte) state
  const [artePrograma, setArtePrograma] = useState("");
  const [arteBgImage, setArteBgImage] = useState<string | null>(null);
  const [arteGenerating, setArteGenerating] = useState(false);
  const arteBgInputRef = useRef<HTMLInputElement>(null);

  const CATEGORIES = [...DEFAULT_CATEGORIES, ...Object.keys(customCategories)];
  const xmlUrl = user
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-xml-enquete?user_id=${user.id}`
    : "";
  useEffect(() => {
    if (user) {
      loadEnquetes();
      loadCustomCategories();
      loadProgramas();
    }
  }, [user]);

  const loadProgramas = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("programas")
      .select("id, nome, dias_semana, horario_inicio, horario_fim")
      .eq("user_id", user.id)
      .eq("ativo", true)
      .order("horario_inicio");
    if (data) setProgramas(data as Programa[]);
  };
  const loadCustomCategories = async () => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("custom_enquete_categories")
      .select("*")
      .eq("user_id", user.id);
    if (!data) return;
    const cats: Record<string, QuizItem[]> = {};
    const toRegenerate: { id: string; nome: string }[] = [];
    for (const row of data) {
      if (row.generated_date === today) {
        cats[row.nome] = row.quizzes as unknown as QuizItem[];
      } else {
        toRegenerate.push({ id: row.id, nome: row.nome });
      }
    }
    setCustomCategories(cats);
    // Regenerate outdated categories in background
    for (const item of toRegenerate) {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-enquetes`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoria: item.nome }) }
        );
        const quizzes = await res.json();
        if (Array.isArray(quizzes) && quizzes.length > 0) {
          await supabase
            .from("custom_enquete_categories")
            .update({ quizzes, generated_date: today } as any)
            .eq("id", item.id);
          setCustomCategories(prev => ({ ...prev, [item.nome]: quizzes }));
        }
      } catch { /* silent */ }
    }
  };
  const loadEnquetes = async () => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("enquetes_agendadas")
      .select("*")
      .eq("user_id", user.id)
      .gte("data_enquete", today)
      .order("data_enquete", { ascending: true });
    if (data) setEnquetes(data as EnqueteAgendada[]);
  };
  const updateResposta = (index: number, value: string) => {
    setRespostas(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };
  const handleSchedule = async () => {
    if (!user) return;
    if (!pergunta.trim() || !dataEnquete || !horarioInicio || !horarioFim) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    if (respostas.some(r => !r.trim())) {
      toast.error("Preencha as duas respostas.");
      return;
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
      pergunta: pergunta.trim(),
      resposta1: respostas[0].trim(),
      resposta2: respostas[1].trim(),
      resposta3: "",
      resposta4: "",
      resposta_correta: correta,
      data_enquete: dataEnquete,
      horario_inicio: horarioInicio,
      horario_fim: horarioFim,
    };
    if (editingId) {
      const { error } = await supabase
        .from("enquetes_agendadas")
        .update(payload)
        .eq("id", editingId);
      if (error) toast.error("Erro ao atualizar enquete.");
      else toast.success("Enquete atualizada!");
    } else {
      const { error } = await supabase
        .from("enquetes_agendadas")
        .insert(payload);
      if (error) toast.error("Erro ao agendar enquete.");
      else toast.success("Enquete agendada!");
    }
    clearForm();
    setSaving(false);
    loadEnquetes();
  };
  const clearForm = () => {
    setPergunta("");
    setRespostas(["", ""]);
    setCorreta(1);
    setDataEnquete("");
    setHorarioInicio("");
    setHorarioFim("");
    setEditingId(null);
    setSelectedCategory("");
  };
  const handleEdit = (e: EnqueteAgendada) => {
    setPergunta(e.pergunta);
    setRespostas([e.resposta1, e.resposta2]);
    setCorreta(e.resposta_correta);
    setDataEnquete(e.data_enquete);
    setHorarioInicio(e.horario_inicio);
    setHorarioFim(e.horario_fim);
    setEditingId(e.id);
    setSelectedCategory("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const handleDelete = async (id: string) => {
    await supabase.from("enquetes_agendadas").delete().eq("id", id);
    toast.success("Enquete removida.");
    loadEnquetes();
  };
  const DAY_MAP: Record<string, number> = { "Dom": 0, "Seg": 1, "Ter": 2, "Qua": 3, "Qui": 4, "Sex": 5, "Sáb": 6 };
  const DAY_NAMES_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const DAY_NAMES_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

  const handleAutoGenerate = async () => {
    if (!user) return;
    if (CATEGORIES.length === 0) {
      toast.error("Cadastre ao menos uma categoria de enquetes.");
      return;
    }

    let targetDays: string[] = [];
    let hInicio = "";
    let hFim = "";

    if (autoMode === "programa") {
      const prog = programas.find(p => p.id === autoPrograma);
      if (!prog) { toast.error("Selecione um programa."); return; }
      targetDays = prog.dias_semana || [];
      hInicio = prog.horario_inicio;
      hFim = prog.horario_fim;
    } else {
      if (autoDiasSemana.length === 0) { toast.error("Selecione ao menos um dia da semana."); return; }
      if (!autoHorarioInicio || !autoHorarioFim) { toast.error("Preencha horário início e fim."); return; }
      const shortToFull: Record<string, string> = { "Dom": "Domingo", "Seg": "Segunda", "Ter": "Terça", "Qua": "Quarta", "Qui": "Quinta", "Sex": "Sexta", "Sáb": "Sábado" };
      targetDays = autoDiasSemana.map(d => shortToFull[d] || d);
      hInicio = autoHorarioInicio;
      hFim = autoHorarioFim;
    }

    setAutoGenerating(true);
    try {
      const today = new Date();
      const datesToSchedule: string[] = [];
      // Scan up to 90 calendar days to collect exactly autoDaysAhead matching dates
      for (let d = 1; d <= 90 && datesToSchedule.length < autoDaysAhead; d++) {
        const date = new Date(today);
        date.setDate(today.getDate() + d);
        const dayName = DAY_NAMES_FULL[date.getDay()];
        if (targetDays.includes(dayName)) {
          datesToSchedule.push(date.toISOString().slice(0, 10));
        }
      }

      if (datesToSchedule.length === 0) {
        toast.error("Nenhum dia corresponde aos dias selecionados no período.");
        setAutoGenerating(false);
        return;
      }

      // Gather ALL quizzes from all pre-built and custom categories
      const allQuizzes: QuizItem[] = [];
      for (const cat of CATEGORIES) {
        const bank = customCategories[cat] || QUIZ_BANK[cat] || [];
        allQuizzes.push(...bank);
      }

      // Shuffle
      const shuffled = [...allQuizzes].sort(() => Math.random() - 0.5);

      const inserts = datesToSchedule.map((date, i) => {
        const quiz = shuffled[i % shuffled.length];
        return {
          user_id: user.id,
          pergunta: quiz.pergunta,
          resposta1: quiz.respostas[0],
          resposta2: quiz.respostas[1],
          resposta3: "",
          resposta4: "",
          resposta_correta: quiz.correta,
          data_enquete: date,
          horario_inicio: hInicio,
          horario_fim: hFim,
        };
      });

      const { error } = await supabase.from("enquetes_agendadas").insert(inserts);
      if (error) {
        toast.error("Erro ao gerar enquetes automáticas.");
      } else {
        toast.success(`${inserts.length} enquetes agendadas automaticamente!`);
        loadEnquetes();
      }
    } catch {
      toast.error("Erro ao gerar enquetes automáticas.");
    } finally {
      setAutoGenerating(false);
    }
  };

  const handleSelectPrebuilt = (quiz: QuizItem) => {
    setPergunta(quiz.pergunta);
    setRespostas([...quiz.respostas]);
    setCorreta(quiz.correta);
    setEditingId(null);
  };
  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setArteBgImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const generateArteForEnquete = useCallback(async (enq: EnqueteAgendada) => {
    if (!arteBgImage) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d")!;

    // Draw background
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = arteBgImage;
    });
    // Cover the canvas with the image
    const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);

    // Semi-transparent overlay at bottom for text readability
    const overlayH = 600;
    const overlayY = canvas.height - overlayH;
    const gradient = ctx.createLinearGradient(0, overlayY, 0, canvas.height);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(0.3, "rgba(0,0,0,0.7)");
    gradient.addColorStop(1, "rgba(0,0,0,0.85)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, overlayY, canvas.width, overlayH);

    // Draw question
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "bold 52px sans-serif";
    wrapText(ctx, enq.pergunta, canvas.width / 2, canvas.height - 380, canvas.width - 120, 64);

    // Draw options
    ctx.font = "44px sans-serif";
    const optY = canvas.height - 180;
    // Option A
    ctx.fillStyle = enq.resposta_correta === 1 ? "#4ade80" : "#ffffff";
    ctx.fillText(`A) ${enq.resposta1}`, canvas.width / 2, optY);
    // Option B
    ctx.fillStyle = enq.resposta_correta === 2 ? "#4ade80" : "#ffffff";
    ctx.fillText(`B) ${enq.resposta2}`, canvas.width / 2, optY + 70);

    // Download
    const link = document.createElement("a");
    const dateStr = new Date(enq.data_enquete + "T12:00:00").toLocaleDateString("pt-BR").replace(/\//g, "-");
    link.download = `enquete_${dateStr}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [arteBgImage]);

  // Helper: wrap text on canvas
  function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
    const words = text.split(" ");
    let line = "";
    let curY = y;
    for (const word of words) {
      const testLine = line + word + " ";
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line.trim(), x, curY);
        line = word + " ";
        curY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), x, curY);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--layout-accent-color, #268ffa), color-mix(in srgb, var(--layout-accent-color, #268ffa) 70%, #000))" }}>
          <HelpCircle size={20} className="text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Enquete</h2>
          <p className="text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Configure perguntas e respostas para exibição no ar</p>
        </div>
      </div>
      {/* XML Link */}
      {user && <XmlLinkRow label="XML ENQUETE" permanentUrl={xmlUrl} />}
      {/* Pre-built quizzes by category */}
      <div className="rounded-xl p-4" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 96%, var(--layout-accent-color, #268ffa))", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 12%, transparent)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} style={{ color: "var(--layout-accent-color, #268ffa)" }} />
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Enquetes pré-prontas</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(prev => prev === cat ? "" : cat)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                backgroundColor: selectedCategory === cat
                  ? "var(--layout-accent-color, #268ffa)"
                  : "color-mix(in srgb, var(--layout-page-bg, #ffffff) 90%, var(--layout-border-color, #333))",
                color: selectedCategory === cat ? "#fff" : "var(--layout-page-text, #1a1a1a)",
              }}
            >
              {cat}
              {customCategories[cat] && (
                <X
                  size={10}
                  className="inline ml-1 opacity-60 hover:opacity-100"
                  onClick={async (ev) => {
                    ev.stopPropagation();
                    if (user) {
                      await supabase.from("custom_enquete_categories").delete().eq("user_id", user.id).eq("nome", cat);
                    }
                    setCustomCategories(prev => {
                      const next = { ...prev };
                      delete next[cat];
                      return next;
                    });
                    if (selectedCategory === cat) setSelectedCategory("");
                  }}
                />
              )}
            </button>
          ))}
          <button
            onClick={() => setShowAddCategory(true)}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-105"
            style={{
              backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #268ffa) 15%, transparent)",
              color: "var(--layout-accent-color, #268ffa)",
            }}
            title="Incluir categoria"
          >
            <Plus size={14} />
          </button>
        </div>
        {selectedCategory && (
          <div className="space-y-2">
            {getQuizzesForCategory(selectedCategory, customCategories).map((quiz, i) => (
              <div
                key={i}
                onClick={() => handleSelectPrebuilt(quiz)}
                className="rounded-lg px-3 py-2 cursor-pointer transition-all hover:scale-[1.01]"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 92%, var(--layout-border-color, #333))",
                  border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 10%, transparent)",
                }}
              >
                <p className="text-xs font-semibold mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{quiz.pergunta}</p>
                <div className="flex flex-wrap gap-1">
                  {quiz.respostas.map((r, j) => (
                    <span
                      key={j}
                      className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: j + 1 === quiz.correta
                          ? "color-mix(in srgb, var(--layout-accent-color, #268ffa) 20%, transparent)"
                          : "color-mix(in srgb, var(--layout-page-bg, #ffffff) 85%, var(--layout-border-color, #333))",
                        color: j + 1 === quiz.correta ? "var(--layout-accent-color, #268ffa)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)",
                        fontWeight: j + 1 === quiz.correta ? 700 : 400,
                      }}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Form */}
      <div className="rounded-xl p-4 space-y-4" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 94%, var(--layout-border-color, #333))", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 12%, transparent)" }}>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide mb-1 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Pergunta</label>
          <Input
            value={pergunta}
            onChange={e => setPergunta(e.target.value)}
            placeholder="Digite a pergunta da enquete..."
            className="text-sm"
            style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }}
          />
        </div>
        {[0, 1].map(i => (
          <div key={i} className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-bold uppercase tracking-wide mb-1 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
                Resposta {i + 1}
              </label>
              <Input
                value={respostas[i]}
                onChange={e => updateResposta(i, e.target.value)}
                placeholder={`Opção ${i + 1}`}
                className="text-sm"
                style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }}
              />
            </div>
            <div className="flex items-center gap-2 pt-4">
              <Checkbox
                checked={correta === i + 1}
                onCheckedChange={() => setCorreta(i + 1)}
                className="border-2"
                style={{ borderColor: correta === i + 1 ? "var(--layout-accent-color, #268ffa)" : "color-mix(in srgb, var(--layout-border-color, #333) 30%, transparent)" }}
              />
              <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: correta === i + 1 ? "var(--layout-accent-color, #268ffa)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                Correta
              </span>
            </div>
          </div>
        ))}
        {/* Schedule */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide mb-1 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Data</label>
            <Input type="date" value={dataEnquete} onChange={e => setDataEnquete(e.target.value)} className="text-sm" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }} />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide mb-1 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Início</label>
            <Input type="time" value={horarioInicio} onChange={e => setHorarioInicio(e.target.value)} className="text-sm" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }} />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide mb-1 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Fim</label>
            <Input type="time" value={horarioFim} onChange={e => setHorarioFim(e.target.value)} className="text-sm" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleSchedule}
            disabled={saving}
            className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl text-white"
            style={{ background: "linear-gradient(135deg, var(--layout-accent-color, #268ffa), color-mix(in srgb, var(--layout-accent-color, #268ffa) 70%, #000))" }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : editingId ? <Save size={14} /> : <CalendarPlus size={14} />}
            {editingId ? "Atualizar" : "Agendar"}
          </Button>
          {editingId && (
            <Button variant="outline" onClick={clearForm} className="text-xs rounded-xl">
              Cancelar
            </Button>
          )}
        </div>
      </div>
      {/* Auto Schedule Section */}
      <div className="rounded-xl p-4 space-y-4" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 94%, var(--layout-accent-color, #268ffa))", border: "1px solid color-mix(in srgb, var(--layout-accent-color, #268ffa) 20%, transparent)" }}>
        <div className="flex items-center gap-2">
          <Wand2 size={16} style={{ color: "var(--layout-accent-color, #268ffa)" }} />
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Programar Automático</span>
        </div>

        {/* Mode selection */}
        <div className="flex gap-2">
          <button
            onClick={() => setAutoMode("programa")}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              backgroundColor: autoMode === "programa" ? "var(--layout-accent-color, #268ffa)" : "color-mix(in srgb, var(--layout-page-bg, #ffffff) 90%, var(--layout-border-color, #333))",
              color: autoMode === "programa" ? "#fff" : "var(--layout-page-text, #1a1a1a)",
            }}
          >
            Por Programa
          </button>
          <button
            onClick={() => setAutoMode("custom")}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              backgroundColor: autoMode === "custom" ? "var(--layout-accent-color, #268ffa)" : "color-mix(in srgb, var(--layout-page-bg, #ffffff) 90%, var(--layout-border-color, #333))",
              color: autoMode === "custom" ? "#fff" : "var(--layout-page-text, #1a1a1a)",
            }}
          >
            Personalizado
          </button>
        </div>

        {autoMode === "programa" ? (
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide mb-1 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Programa</label>
            <select
              value={autoPrograma}
              onChange={e => setAutoPrograma(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }}
            >
              <option value="">Selecione um programa...</option>
              {programas.map(p => (
                <option key={p.id} value={p.id}>{p.nome} ({p.horario_inicio}–{p.horario_fim})</option>
              ))}
            </select>
            {autoPrograma && (() => {
              const prog = programas.find(p => p.id === autoPrograma);
              return prog ? (
                <p className="text-[10px] mt-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                  Dias: {(prog.dias_semana || []).join(", ")} • Horário: {prog.horario_inicio}–{prog.horario_fim}
                </p>
              ) : null;
            })()}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide mb-1 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Dias da Semana</label>
              <div className="flex flex-wrap gap-2">
                {DAY_NAMES_SHORT.map(day => (
                  <button
                    key={day}
                    onClick={() => setAutoDiasSemana(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      backgroundColor: autoDiasSemana.includes(day) ? "var(--layout-accent-color, #268ffa)" : "color-mix(in srgb, var(--layout-page-bg, #ffffff) 88%, var(--layout-border-color, #333))",
                      color: autoDiasSemana.includes(day) ? "#fff" : "var(--layout-page-text, #1a1a1a)",
                    }}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide mb-1 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Início</label>
                <Input type="time" value={autoHorarioInicio} onChange={e => setAutoHorarioInicio(e.target.value)} className="text-sm" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide mb-1 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Fim</label>
                <Input type="time" value={autoHorarioFim} onChange={e => setAutoHorarioFim(e.target.value)} className="text-sm" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }} />
              </div>
            </div>
          </div>
        )}

        {/* Days ahead */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide mb-1 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Gerar para os próximos</label>
          <div className="flex gap-2">
            {[5, 10, 15].map(d => (
              <button
                key={d}
                onClick={() => setAutoDaysAhead(d)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  backgroundColor: autoDaysAhead === d ? "var(--layout-accent-color, #268ffa)" : "color-mix(in srgb, var(--layout-page-bg, #ffffff) 90%, var(--layout-border-color, #333))",
                  color: autoDaysAhead === d ? "#fff" : "var(--layout-page-text, #1a1a1a)",
                }}
              >
                {d} dias
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={handleAutoGenerate}
          disabled={autoGenerating}
          className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl text-white"
          style={{ background: "linear-gradient(135deg, var(--layout-accent-color, #268ffa), color-mix(in srgb, var(--layout-accent-color, #268ffa) 70%, #000))" }}
        >
          {autoGenerating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          {autoGenerating ? "Gerando..." : "Programar Automático"}
        </Button>

        <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
          As enquetes serão distribuídas aleatoriamente entre as categorias cadastradas.
        </p>
      </div>

      {/* Máscara (Arte) Section */}
      <div className="rounded-xl p-4 space-y-4" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 94%, var(--layout-accent-color, #268ffa))", border: "1px solid color-mix(in srgb, var(--layout-accent-color, #268ffa) 20%, transparent)" }}>
        <div className="flex items-center gap-2">
          <ImageIcon size={16} style={{ color: "var(--layout-accent-color, #268ffa)" }} />
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Cadastro de Máscara (Arte)</span>
        </div>
        <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
          Selecione um programa e faça upload de uma imagem de fundo. O sistema irá gerar artes com o texto das enquetes agendadas no formato 9:16 (1080x1920).
        </p>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide mb-1 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Programa</label>
          <select
            value={artePrograma}
            onChange={e => setArtePrograma(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }}
          >
            <option value="">Selecione um programa...</option>
            {programas.map(p => (
              <option key={p.id} value={p.id}>{p.nome} ({p.horario_inicio}–{p.horario_fim})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide mb-1 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Imagem de Fundo (9:16)</label>
          <input
            ref={arteBgInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleBgUpload}
          />
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => arteBgInputRef.current?.click()}
              className="flex items-center gap-2 text-xs rounded-xl"
            >
              <Upload size={14} />
              {arteBgImage ? "Trocar Imagem" : "Upload Fundo"}
            </Button>
            {arteBgImage && (
              <div className="flex items-center gap-2">
                <img src={arteBgImage} alt="preview" className="h-16 rounded-lg border object-cover" style={{ aspectRatio: "9/16" }} />
                <button onClick={() => setArteBgImage(null)} className="p-1 rounded hover:bg-black/5"><X size={14} className="text-red-500" /></button>
              </div>
            )}
          </div>
        </div>

        {/* Preview & download list */}
        {arteBgImage && artePrograma && (() => {
          const prog = programas.find(p => p.id === artePrograma);
          if (!prog) return null;
          const matched = enquetes.filter(e => e.horario_inicio === prog.horario_inicio && e.horario_fim === prog.horario_fim);
          if (matched.length === 0) return (
            <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
              Nenhuma enquete agendada para este programa.
            </p>
          );
          return (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wide block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
                Enquetes Disponíveis ({matched.length})
              </label>
              {matched.map(enq => (
                <div
                  key={enq.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 92%, var(--layout-border-color, #333))",
                    border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 10%, transparent)",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{enq.pergunta}</p>
                    <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                      {new Date(enq.data_enquete + "T12:00:00").toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => generateArteForEnquete(enq)}
                    className="flex items-center gap-1.5 text-[10px] font-bold rounded-lg text-white px-3 py-1"
                    style={{ background: "linear-gradient(135deg, var(--layout-accent-color, #268ffa), color-mix(in srgb, var(--layout-accent-color, #268ffa) 70%, #000))" }}
                  >
                    <Download size={12} /> Baixar Arte
                  </Button>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {enquetes.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 12%, transparent)" }}>
          <div className="px-4 py-2.5" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 94%, var(--layout-border-color, #333))" }}>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Enquetes Agendadas</span>
          </div>
          <div className="divide-y" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 8%, transparent)" }}>
            {enquetes.map(e => (
              <div key={e.id} className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{e.pergunta}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                    {new Date(e.data_enquete + "T12:00:00").toLocaleDateString("pt-BR")} • {e.horario_inicio}–{e.horario_fim} • Correta: {e[`resposta${e.resposta_correta}` as keyof EnqueteAgendada]}
                  </p>
                </div>
                <button onClick={() => handleEdit(e)} className="p-1.5 rounded-lg transition-colors hover:bg-black/5" title="Editar">
                  <Pencil size={14} style={{ color: "var(--layout-accent-color, #268ffa)" }} />
                </button>
                <button onClick={() => handleDelete(e.id)} className="p-1.5 rounded-lg transition-colors hover:bg-black/5" title="Excluir">
                  <Trash2 size={14} className="text-red-500" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Add Category Dialog */}
      {showAddCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAddCategory(false)}>
          <div
            className="w-full max-w-sm mx-4 rounded-xl p-5 space-y-4"
            style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nova Categoria</h3>
              <button onClick={() => setShowAddCategory(false)} className="p-1 rounded hover:bg-black/5"><X size={16} /></button>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide mb-1 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Nome da Categoria</label>
              <Input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="Ex: Esportes, Cinema, Música Pop..." />
              <p className="text-[10px] mt-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                O sistema gerará 5 enquetes automaticamente, atualizando diariamente.
              </p>
            </div>
            <Button
              disabled={loadingCategory}
              onClick={async () => {
                const name = newCategoryName.trim();
                if (!name) { toast.error("Digite o nome da categoria."); return; }
                if (CATEGORIES.includes(name)) { toast.error("Categoria já existe."); return; }
                setLoadingCategory(true);
                try {
                  const res = await fetch(
                    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-enquetes`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ categoria: name }),
                    }
                  );
                  const quizzes = await res.json();
                  if (Array.isArray(quizzes) && quizzes.length > 0) {
                    const today = new Date().toISOString().slice(0, 10);
                    if (user) {
                      await supabase.from("custom_enquete_categories").insert({
                        user_id: user.id,
                        nome: name,
                        quizzes,
                        generated_date: today,
                      } as any);
                    }
                    setCustomCategories(prev => ({ ...prev, [name]: quizzes }));
                    setShowAddCategory(false);
                    setNewCategoryName("");
                    setSelectedCategory(name);
                    toast.success(`Categoria "${name}" adicionada com 5 enquetes!`);
                  } else {
                    toast.error("Não foi possível gerar enquetes. Tente outro tema.");
                  }
                } catch {
                  toast.error("Erro ao gerar enquetes.");
                } finally {
                  setLoadingCategory(false);
                }
              }}
              className="w-full"
              style={{ backgroundColor: "var(--layout-accent-color, #268ffa)" }}
            >
              {loadingCategory ? <><Loader2 size={14} className="mr-1 animate-spin" /> Gerando enquetes...</> : <><Plus size={14} className="mr-1" /> Adicionar Categoria</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
