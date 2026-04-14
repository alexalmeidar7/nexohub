import { useState, useEffect } from "react";
import { HelpCircle, Loader2, CalendarPlus, Save, Trash2, Pencil, Sparkles, Plus, X } from "lucide-react";
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
  respostas: [string, string, string, string];
  correta: number; // 1-4
}

const QUIZ_BANK: Record<string, QuizItem[]> = {
  "Música Sertaneja": [
    { pergunta: "Qual dupla gravou 'Evidências'?", respostas: ["Chitãozinho & Xororó", "Zezé Di Camargo & Luciano", "Leandro & Leonardo", "Bruno & Marrone"], correta: 1 },
    { pergunta: "Quem canta 'Boate Azul'?", respostas: ["Bruno & Marrone", "Milionário & José Rico", "Tonico & Tinoco", "Tião Carreiro & Pardinho"], correta: 2 },
    { pergunta: "Qual cantor é conhecido como 'Rei do Sertanejo'?", respostas: ["Daniel", "Leonardo", "Luan Santana", "Gusttavo Lima"], correta: 2 },
    { pergunta: "Qual dupla gravou 'É o Amor'?", respostas: ["Chitãozinho & Xororó", "Zezé Di Camargo & Luciano", "Rick & Renner", "João Paulo & Daniel"], correta: 2 },
    { pergunta: "Quem canta 'Telefone Mudo'?", respostas: ["Leandro & Leonardo", "Milionário & José Rico", "Tonico & Tinoco", "Tião Carreiro & Pardinho"], correta: 1 },
    { pergunta: "Qual artista gravou 'Inventor dos Amores'?", respostas: ["Gusttavo Lima", "Luan Santana", "Jorge & Mateus", "Marília Mendonça"], correta: 2 },
    { pergunta: "Qual dupla é famosa por 'Fio de Cabelo'?", respostas: ["Chitãozinho & Xororó", "Zezé Di Camargo & Luciano", "Victor & Leo", "César Menotti & Fabiano"], correta: 1 },
    { pergunta: "Quem gravou 'Ainda Ontem Chorei de Saudade'?", respostas: ["João Paulo & Daniel", "Leandro & Leonardo", "Bruno & Marrone", "Di Paullo & Paulino"], correta: 1 },
    { pergunta: "Qual cantora é conhecida como 'Rainha da Sofrência'?", respostas: ["Simone Mendes", "Maiara", "Marília Mendonça", "Naiara Azevedo"], correta: 3 },
    { pergunta: "Quem canta 'Amor da Minha Vida'?", respostas: ["Daniel", "Leonardo", "Zezé Di Camargo", "Victor & Leo"], correta: 1 },
    { pergunta: "Qual dupla gravou 'Pense em Mim'?", respostas: ["Leandro & Leonardo", "Chitãozinho & Xororó", "Zezé Di Camargo & Luciano", "Rick & Renner"], correta: 1 },
    { pergunta: "Quem é o intérprete de 'Tarde Demais'?", respostas: ["Gusttavo Lima", "Cristiano Araújo", "Luan Santana", "Michel Teló"], correta: 2 },
    { pergunta: "Qual artista gravou 'Apelido Carinhoso'?", respostas: ["Gusttavo Lima", "Jorge & Mateus", "Henrique & Juliano", "Matheus & Kauan"], correta: 1 },
    { pergunta: "Quem canta 'Pot-Pourri do Amor'?", respostas: ["Tonico & Tinoco", "Milionário & José Rico", "Tião Carreiro & Pardinho", "Liu & Léu"], correta: 2 },
    { pergunta: "Qual dupla gravou 'Temporal de Amor'?", respostas: ["Leandro & Leonardo", "Bruno & Marrone", "Zezé Di Camargo & Luciano", "César Menotti & Fabiano"], correta: 1 },
  ],
  "Política": [
    { pergunta: "Quem foi o 1º presidente do Brasil?", respostas: ["Deodoro da Fonseca", "Floriano Peixoto", "Prudente de Morais", "Campos Sales"], correta: 1 },
    { pergunta: "Em que ano foi promulgada a Constituição atual?", respostas: ["1985", "1988", "1990", "1993"], correta: 2 },
    { pergunta: "Quantos senadores cada estado brasileiro elege?", respostas: ["2", "3", "4", "5"], correta: 2 },
    { pergunta: "Quem foi o presidente mais jovem do Brasil?", respostas: ["Jânio Quadros", "Fernando Collor", "Juscelino Kubitschek", "Tancredo Neves"], correta: 2 },
    { pergunta: "Qual é a idade mínima para ser presidente no Brasil?", respostas: ["30 anos", "35 anos", "40 anos", "25 anos"], correta: 2 },
    { pergunta: "Quantos deputados federais o Brasil possui?", respostas: ["400", "513", "600", "350"], correta: 2 },
    { pergunta: "Quem foi o último presidente militar do Brasil?", respostas: ["Ernesto Geisel", "João Figueiredo", "Emílio Médici", "Costa e Silva"], correta: 2 },
    { pergunta: "Em que ano o voto feminino foi instituído no Brasil?", respostas: ["1920", "1932", "1945", "1950"], correta: 2 },
    { pergunta: "Qual presidente construiu Brasília?", respostas: ["Getúlio Vargas", "Juscelino Kubitschek", "Jânio Quadros", "João Goulart"], correta: 2 },
    { pergunta: "Qual é o órgão máximo do Poder Judiciário brasileiro?", respostas: ["TSE", "STJ", "STF", "TRF"], correta: 3 },
    { pergunta: "Quantos ministros compõem o STF?", respostas: ["9", "11", "13", "15"], correta: 2 },
    { pergunta: "Quem proclamou a República do Brasil?", respostas: ["Dom Pedro II", "Deodoro da Fonseca", "Floriano Peixoto", "Benjamin Constant"], correta: 2 },
    { pergunta: "Qual presidente sofreu impeachment em 1992?", respostas: ["Itamar Franco", "Fernando Collor", "José Sarney", "Fernando Henrique"], correta: 2 },
    { pergunta: "Quantos estados o Brasil possui?", respostas: ["24", "25", "26", "27"], correta: 3 },
    { pergunta: "Qual é o mandato de um senador no Brasil?", respostas: ["4 anos", "6 anos", "8 anos", "5 anos"], correta: 2 },
  ],
  "História do Brasil": [
    { pergunta: "Em que ano o Brasil foi descoberto?", respostas: ["1492", "1500", "1510", "1498"], correta: 2 },
    { pergunta: "Quem liderou a Inconfidência Mineira?", respostas: ["Tiradentes", "Tomás Antônio Gonzaga", "Cláudio Manuel da Costa", "Alvarenga Peixoto"], correta: 1 },
    { pergunta: "Em que ano a escravidão foi abolida no Brasil?", respostas: ["1850", "1871", "1888", "1900"], correta: 3 },
    { pergunta: "Qual tratado dividiu o mundo entre Portugal e Espanha?", respostas: ["Tratado de Madrid", "Tratado de Tordesilhas", "Tratado de Utrecht", "Tratado de Methuen"], correta: 2 },
    { pergunta: "Quem assinou a Lei Áurea?", respostas: ["Dom Pedro II", "Princesa Isabel", "José Bonifácio", "Deodoro da Fonseca"], correta: 2 },
    { pergunta: "Em que ano o Brasil se tornou independente?", respostas: ["1808", "1822", "1824", "1831"], correta: 2 },
    { pergunta: "Qual foi a primeira capital do Brasil?", respostas: ["Rio de Janeiro", "São Paulo", "Salvador", "Recife"], correta: 3 },
    { pergunta: "Quem liderou a Revolução Farroupilha?", respostas: ["Bento Gonçalves", "Garibaldi", "David Canabarro", "Anita Garibaldi"], correta: 1 },
    { pergunta: "Em que ano a família real chegou ao Brasil?", respostas: ["1800", "1808", "1815", "1820"], correta: 2 },
    { pergunta: "Qual era o nome oficial do Brasil colônia?", respostas: ["Terra de Santa Cruz", "Terra de Vera Cruz", "América Portuguesa", "Brasil Colônia"], correta: 1 },
    { pergunta: "Quem gritou 'Independência ou Morte'?", respostas: ["Dom Pedro I", "José Bonifácio", "Dom Pedro II", "Tiradentes"], correta: 1 },
    { pergunta: "Qual revolta ocorreu na Bahia em 1798?", respostas: ["Balaiada", "Conjuração Baiana", "Sabinada", "Cabanagem"], correta: 2 },
    { pergunta: "Em que ano Getúlio Vargas assumiu pela 1ª vez?", respostas: ["1928", "1930", "1932", "1934"], correta: 2 },
    { pergunta: "Qual foi o primeiro produto de exportação do Brasil?", respostas: ["Café", "Açúcar", "Pau-Brasil", "Ouro"], correta: 3 },
    { pergunta: "Em que ano começou a ditadura militar?", respostas: ["1960", "1964", "1968", "1970"], correta: 2 },
  ],
  "Curiosidades": [
    { pergunta: "Qual é o maior osso do corpo humano?", respostas: ["Tíbia", "Úmero", "Fêmur", "Fíbula"], correta: 3 },
    { pergunta: "Quantos litros de sangue o corpo humano possui?", respostas: ["3 litros", "5 litros", "7 litros", "10 litros"], correta: 2 },
    { pergunta: "Qual é o animal mais rápido do mundo?", respostas: ["Leopardo", "Guepardo", "Falcão-peregrino", "Lebre"], correta: 3 },
    { pergunta: "Qual planeta é conhecido como Estrela d'Alva?", respostas: ["Marte", "Júpiter", "Vênus", "Saturno"], correta: 3 },
    { pergunta: "Quantos dentes tem um adulto?", respostas: ["28", "30", "32", "34"], correta: 3 },
    { pergunta: "Qual é o menor país do mundo?", respostas: ["Mônaco", "Vaticano", "San Marino", "Liechtenstein"], correta: 2 },
    { pergunta: "Qual é o rio mais extenso do mundo?", respostas: ["Nilo", "Amazonas", "Yangtzé", "Mississippi"], correta: 2 },
    { pergunta: "Quantos ossos tem o corpo humano adulto?", respostas: ["186", "206", "226", "256"], correta: 2 },
    { pergunta: "Qual é o elemento químico mais abundante no universo?", respostas: ["Oxigênio", "Carbono", "Hélio", "Hidrogênio"], correta: 4 },
    { pergunta: "Qual é o maior oceano do planeta?", respostas: ["Atlântico", "Índico", "Pacífico", "Ártico"], correta: 3 },
    { pergunta: "Quantas cores tem o arco-íris?", respostas: ["5", "6", "7", "8"], correta: 3 },
    { pergunta: "Qual é a vitamina do sol?", respostas: ["Vitamina A", "Vitamina B", "Vitamina C", "Vitamina D"], correta: 4 },
    { pergunta: "Qual animal é o símbolo da paz?", respostas: ["Águia", "Pomba", "Cisne", "Coruja"], correta: 2 },
    { pergunta: "Quantos fusos horários o Brasil possui?", respostas: ["3", "4", "5", "6"], correta: 2 },
    { pergunta: "Qual o metal mais caro do mundo?", respostas: ["Ouro", "Platina", "Ródio", "Paládio"], correta: 3 },
  ],
};

const DEFAULT_CATEGORIES = Object.keys(QUIZ_BANK);


function getQuizzesForCategory(category: string): QuizItem[] {
  const bank = QUIZ_BANK[category] || [];
  if (bank.length === 0) return [];
  // Rotate daily: pick 5 based on day of year
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

export default function EnquetePage() {
  const { user } = useAuth();
  const [pergunta, setPergunta] = useState("");
  const [respostas, setRespostas] = useState(["", "", "", ""]);
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
  const [newCategoryQuizzes, setNewCategoryQuizzes] = useState<QuizItem[]>(
    Array.from({ length: 5 }, () => ({ pergunta: "", respostas: ["", "", "", ""], correta: 1 }))
  );

  const CATEGORIES = [...DEFAULT_CATEGORIES, ...Object.keys(customCategories)];
  const xmlUrl = user
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-xml-enquete?user_id=${user.id}`
    : "";

  useEffect(() => {
    if (user) loadEnquetes();
  }, [user]);

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
      toast.error("Preencha todas as 4 respostas.");
      return;
    }

    setSaving(true);
    const payload = {
      user_id: user.id,
      pergunta: pergunta.trim(),
      resposta1: respostas[0].trim(),
      resposta2: respostas[1].trim(),
      resposta3: respostas[2].trim(),
      resposta4: respostas[3].trim(),
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
    setRespostas(["", "", "", ""]);
    setCorreta(1);
    setDataEnquete("");
    setHorarioInicio("");
    setHorarioFim("");
    setEditingId(null);
    setSelectedCategory("");
  };

  const handleEdit = (e: EnqueteAgendada) => {
    setPergunta(e.pergunta);
    setRespostas([e.resposta1, e.resposta2, e.resposta3, e.resposta4]);
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

  const handleSelectPrebuilt = (quiz: QuizItem) => {
    setPergunta(quiz.pergunta);
    setRespostas([...quiz.respostas]);
    setCorreta(quiz.correta);
    setEditingId(null);
  };

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
        <div className="flex flex-wrap gap-2 mb-3">
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
            </button>
          ))}
        </div>
        {selectedCategory && (
          <div className="space-y-2">
            {getQuizzesForCategory(selectedCategory).map((quiz, i) => (
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

        {[0, 1, 2, 3].map(i => (
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

      {/* Scheduled list */}
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
    </div>
  );
}
