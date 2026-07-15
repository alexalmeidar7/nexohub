import { useState, useEffect } from "react";
import { HelpCircle, Loader2, CalendarPlus, Save, Trash2, Pencil, Sparkles, Plus, X, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import XmlLinkRow from "./XmlLinkRow";
import { toast } from "sonner";

interface QuizItem {
  pergunta: string;
  respostas: [string, string, string, string];
  correta: number; // 1-4
  explicacao?: string;
  imagem_url?: string;
}

const QUIZ_BANK: Record<string, QuizItem[]> = {
  "Música Sertaneja": [
    { pergunta: "Qual dupla gravou 'Evidências'?", respostas: ["Chitãozinho & Xororó", "Zezé Di Camargo & Luciano", "Leandro & Leonardo", "Bruno & Marrone"], correta: 1 },
    { pergunta: "Quem canta 'Boate Azul'?", respostas: ["Milionário & José Rico", "Bruno & Marrone", "Tonico & Tinoco", "Sérgio Reis"], correta: 1 },
    { pergunta: "Qual cantor é conhecido como 'Rei do Sertanejo'?", respostas: ["Leonardo", "Daniel", "Chitãozinho", "Luan Santana"], correta: 1 },
    { pergunta: "Qual dupla gravou 'É o Amor'?", respostas: ["Zezé Di Camargo & Luciano", "Chitãozinho & Xororó", "Jorge & Mateus", "Henrique & Juliano"], correta: 1 },
    { pergunta: "Quem canta 'Telefone Mudo'?", respostas: ["Leandro & Leonardo", "Milionário & José Rico", "Rick & Renner", "Gian & Giovani"], correta: 1 },
    { pergunta: "Qual artista gravou 'Inventor dos Amores'?", respostas: ["Luan Santana", "Gusttavo Lima", "Michel Teló", "Lucas Lucco"], correta: 1 },
    { pergunta: "Qual dupla é famosa por 'Fio de Cabelo'?", respostas: ["Chitãozinho & Xororó", "Zezé Di Camargo & Luciano", "Victor & Leo", "César Menotti & Fabiano"], correta: 1 },
    { pergunta: "Quem gravou 'Ainda Ontem Chorei de Saudade'?", respostas: ["João Paulo & Daniel", "Leandro & Leonardo", "Bruno & Marrone", "Rick & Renner"], correta: 1 },
    { pergunta: "Qual cantora é conhecida como 'Rainha da Sofrência'?", respostas: ["Marília Mendonça", "Simone Mendes", "Maiara", "Naiara Azevedo"], correta: 1 },
    { pergunta: "Quem canta 'Amor da Minha Vida'?", respostas: ["Daniel", "Leonardo", "Zezé Di Camargo", "Luan Santana"], correta: 1 },
    { pergunta: "Qual dupla gravou 'Pense em Mim'?", respostas: ["Leandro & Leonardo", "Chitãozinho & Xororó", "Bruno & Marrone", "Zezé Di Camargo & Luciano"], correta: 1 },
    { pergunta: "Quem é o intérprete de 'Tarde Demais'?", respostas: ["Cristiano Araújo", "Gusttavo Lima", "Jorge", "Mateus"], correta: 1 },
    { pergunta: "Qual artista gravou 'Apelido Carinhoso'?", respostas: ["Gusttavo Lima", "Jorge & Mateus", "Wesley Safadão", "Luan Santana"], correta: 1 },
    { pergunta: "Quem canta 'Pot-Pourri do Amor'?", respostas: ["Milionário & José Rico", "Tonico & Tinoco", "Tião Carreiro & Pardinho", "Cascatinha & Inhana"], correta: 1 },
    { pergunta: "Qual dupla gravou 'Temporal de Amor'?", respostas: ["Leandro & Leonardo", "Bruno & Marrone", "Rick & Renner", "Chrystian & Ralf"], correta: 1 },
  ],
  "Política": [
    { pergunta: "Quem foi o 1º presidente do Brasil?", respostas: ["Deodoro da Fonseca", "Floriano Peixoto", "Prudente de Morais", "Campos Sales"], correta: 1 },
    { pergunta: "Em que ano foi promulgada a Constituição atual?", respostas: ["1988", "1985", "1990", "1982"], correta: 1 },
    { pergunta: "Quantos senadores cada estado brasileiro elege?", respostas: ["3", "2", "4", "5"], correta: 1 },
    { pergunta: "Quem foi o presidente mais jovem do Brasil?", respostas: ["Fernando Collor", "Jânio Quadros", "Tancredo Neves", "JK"], correta: 1 },
    { pergunta: "Qual é a idade mínima para ser presidente no Brasil?", respostas: ["35 anos", "30 anos", "40 anos", "25 anos"], correta: 1 },
    { pergunta: "Quantos deputados federais o Brasil possui?", respostas: ["513", "400", "600", "450"], correta: 1 },
    { pergunta: "Quem foi o último presidente militar do Brasil?", respostas: ["João Figueiredo", "Ernesto Geisel", "Médici", "Costa e Silva"], correta: 1 },
    { pergunta: "Em que ano o voto feminino foi instituído no Brasil?", respostas: ["1932", "1920", "1946", "1950"], correta: 1 },
    { pergunta: "Qual presidente construiu Brasília?", respostas: ["Juscelino Kubitschek", "Getúlio Vargas", "Jânio Quadros", "João Goulart"], correta: 1 },
    { pergunta: "Qual é o órgão máximo do Poder Judiciário brasileiro?", respostas: ["STF", "TSE", "STJ", "TST"], correta: 1 },
    { pergunta: "Quantos ministros compõem o STF?", respostas: ["11", "9", "13", "15"], correta: 1 },
    { pergunta: "Quem proclamou a República do Brasil?", respostas: ["Deodoro da Fonseca", "Dom Pedro II", "José Bonifácio", "Tiradentes"], correta: 1 },
    { pergunta: "Qual presidente sofreu impeachment em 1992?", respostas: ["Fernando Collor", "Itamar Franco", "José Sarney", "Fernando Henrique"], correta: 1 },
    { pergunta: "Quantos estados o Brasil possui?", respostas: ["26", "24", "27", "25"], correta: 1 },
    { pergunta: "Qual é o mandato de um senador no Brasil?", respostas: ["8 anos", "4 anos", "6 anos", "5 anos"], correta: 1 },
  ],
  "História do Brasil": [
    { pergunta: "Em que ano o Brasil foi descoberto?", respostas: ["1500", "1492", "1510", "1498"], correta: 1 },
    { pergunta: "Quem liderou a Inconfidência Mineira?", respostas: ["Tiradentes", "Tomás Antônio Gonzaga", "Cláudio Manuel da Costa", "Alvarenga Peixoto"], correta: 1 },
    { pergunta: "Em que ano a escravidão foi abolida no Brasil?", respostas: ["1888", "1850", "1871", "1885"], correta: 1 },
    { pergunta: "Qual tratado dividiu o mundo entre Portugal e Espanha?", respostas: ["Tratado de Tordesilhas", "Tratado de Madrid", "Tratado de Santo Ildefonso", "Tratado de Utrecht"], correta: 1 },
    { pergunta: "Quem assinou a Lei Áurea?", respostas: ["Princesa Isabel", "Dom Pedro II", "Dom Pedro I", "José Bonifácio"], correta: 1 },
    { pergunta: "Em que ano o Brasil se tornou independente?", respostas: ["1822", "1808", "1831", "1815"], correta: 1 },
    { pergunta: "Qual foi a primeira capital do Brasil?", respostas: ["Salvador", "Rio de Janeiro", "Recife", "São Paulo"], correta: 1 },
    { pergunta: "Quem liderou a Revolução Farroupilha?", respostas: ["Bento Gonçalves", "Garibaldi", "David Canabarro", "Antônio de Souza Neto"], correta: 1 },
    { pergunta: "Em que ano a família real chegou ao Brasil?", respostas: ["1808", "1800", "1815", "1820"], correta: 1 },
    { pergunta: "Qual era o nome oficial do Brasil colônia?", respostas: ["Terra de Santa Cruz", "Terra de Vera Cruz", "Ilha de Vera Cruz", "Brasil Colônia"], correta: 1 },
    { pergunta: "Quem gritou 'Independência ou Morte'?", respostas: ["Dom Pedro I", "José Bonifácio", "Tiradentes", "Dom João VI"], correta: 1 },
    { pergunta: "Qual revolta ocorreu na Bahia em 1798?", respostas: ["Conjuração Baiana", "Balaiada", "Cabanagem", "Sabinada"], correta: 1 },
    { pergunta: "Em que ano Getúlio Vargas assumiu pela 1ª vez?", respostas: ["1930", "1928", "1934", "1932"], correta: 1 },
    { pergunta: "Qual foi o primeiro produto de exportação do Brasil?", respostas: ["Pau-Brasil", "Café", "Açúcar", "Ouro"], correta: 1 },
    { pergunta: "Em que ano começou a ditadura militar?", respostas: ["1964", "1960", "1968", "1970"], correta: 1 },
  ],
  "Curiosidades": [
    { pergunta: "Qual é o maior osso do corpo humano?", respostas: ["Fêmur", "Tíbia", "Úmero", "Rádio"], correta: 1 },
    { pergunta: "Quantos litros de sangue o corpo humano possui?", respostas: ["5 litros", "3 litros", "7 litros", "10 litros"], correta: 1 },
    { pergunta: "Qual é o animal mais rápido do mundo?", respostas: ["Falcão-peregrino", "Leopardo", "Águia", "Leão"], correta: 1 },
    { pergunta: "Qual planeta é conhecido como Estrela d'Alva?", respostas: ["Vênus", "Marte", "Júpiter", "Mercúrio"], correta: 1 },
    { pergunta: "Quantos dentes tem um adulto?", respostas: ["32", "28", "30", "36"], correta: 1 },
    { pergunta: "Qual é o menor país do mundo?", respostas: ["Vaticano", "Mônaco", "San Marino", "Liechtenstein"], correta: 1 },
    { pergunta: "Qual é o rio mais extenso do mundo?", respostas: ["Amazonas", "Nilo", "Yangtzé", "Mississippi"], correta: 1 },
    { pergunta: "Quantos ossos tem o corpo humano adulto?", respostas: ["206", "186", "220", "196"], correta: 1 },
    { pergunta: "Qual é o elemento químico mais abundante no universo?", respostas: ["Hidrogênio", "Oxigênio", "Hélio", "Carbono"], correta: 1 },
    { pergunta: "Qual é o maior oceano do planeta?", respostas: ["Pacífico", "Atlântico", "Índico", "Ártico"], correta: 1 },
    { pergunta: "Quantas cores tem o arco-íris?", respostas: ["7", "5", "6", "8"], correta: 1 },
    { pergunta: "Qual é a vitamina do sol?", respostas: ["Vitamina D", "Vitamina A", "Vitamina C", "Vitamina E"], correta: 1 },
    { pergunta: "Qual animal é o símbolo da paz?", respostas: ["Pomba", "Águia", "Coruja", "Cisne"], correta: 1 },
    { pergunta: "Quantos fusos horários o Brasil possui?", respostas: ["4", "3", "5", "2"], correta: 1 },
    { pergunta: "Qual o metal mais caro do mundo?", respostas: ["Ródio", "Ouro", "Platina", "Paládio"], correta: 1 },
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
  imagem_resposta: string;
}

export default function QuizPage() {
  const { user } = useAuth();
  const [pergunta, setPergunta] = useState("");
  const [respostas, setRespostas] = useState(["", "", "", ""]);
  const [correta, setCorreta] = useState(1);
  const [dataQuiz, setDataQuiz] = useState("");
  const [horarioInicio, setHorarioInicio] = useState("");
  const [horarioFim, setHorarioFim] = useState("");
  const [quizzes, setQuizzes] = useState<QuizAgendado[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [customCategories, setCustomCategories] = useState<Record<string, QuizItem[]>>({});
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [explicacao, setExplicacao] = useState("");
  const [imagemResposta, setImagemResposta] = useState("");
  const [imagemSkip, setImagemSkip] = useState(0);
  const [loadingImage, setLoadingImage] = useState(false);

  const fetchAnotherImage = async () => {
    const respostaCorretaTexto = respostas[correta - 1]?.trim();
    if (!respostaCorretaTexto) {
      toast.error("Preencha a resposta correta primeiro.");
      return;
    }
    setLoadingImage(true);
    try {
      const nextSkip = imagemSkip + 1;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-quiz-explanation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resposta_correta_texto: respostaCorretaTexto,
            only_image: true,
            skip: nextSkip,
          }),
        }
      );
      const data = await res.json();
      if (data.imagem_url) {
        setImagemResposta(data.imagem_url);
        setImagemSkip(nextSkip);
        toast.success("Outra imagem carregada.");
      } else {
        toast.error("Nenhuma imagem alternativa encontrada.");
      }
    } catch {
      toast.error("Falha ao buscar outra imagem.");
    } finally {
      setLoadingImage(false);
    }
  };

  const clearImage = () => {
    setImagemResposta("");
    setImagemSkip(0);
  };

  const CATEGORIES = [...DEFAULT_CATEGORIES, ...Object.keys(customCategories)];

  const xmlUrl = user
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-xml-quiz?user_id=${user.id}`
    : "";

  useEffect(() => {
    if (user) {
      loadQuizzes();
      loadCustomCategories();
    }
  }, [user]);

  const loadCustomCategories = async () => {
    if (!user) return;
    const today = todayInBrasilia();
    const { data } = await supabase
      .from("custom_quiz_categories")
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
    for (const item of toRegenerate) {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-quiz`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoria: item.nome }) }
        );
        const generatedQuizzes = await res.json();
        if (Array.isArray(generatedQuizzes) && generatedQuizzes.length > 0) {
          await supabase
            .from("custom_quiz_categories")
            .update({ quizzes: generatedQuizzes, generated_date: today } as any)
            .eq("id", item.id);
          setCustomCategories(prev => ({ ...prev, [item.nome]: generatedQuizzes }));
        }
      } catch { /* silent */ }
    }
  };

  const loadQuizzes = async () => {
    if (!user) return;
    const today = todayInBrasilia();
    const { data } = await supabase
      .from("quiz_agendados")
      .select("*")
      .eq("user_id", user.id)
      .gte("data_quiz", today)
      .order("data_quiz", { ascending: true });
    if (data) setQuizzes(data as QuizAgendado[]);
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
    if (!pergunta.trim() || !dataQuiz || !horarioInicio || !horarioFim) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    if (respostas.some(r => !r.trim())) {
      toast.error("Preencha as quatro respostas.");
      return;
    }
    setSaving(true);

    // Auto-generate explanation and image if not provided or when editing
    let finalExplicacao = explicacao.trim();
    let finalImagem = imagemResposta.trim();
    const shouldRegenerate = editingId || !finalExplicacao || !finalImagem;
    if (shouldRegenerate) {
      try {
        const respostaCorretaTexto = respostas[correta - 1].trim();
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-quiz-explanation`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pergunta: pergunta.trim(), resposta_correta_texto: respostaCorretaTexto }),
          }
        );
        if (res.ok) {
          const aiData = await res.json();
          if (aiData.explicacao) finalExplicacao = aiData.explicacao;
          if (aiData.imagem_url) finalImagem = aiData.imagem_url;
          setExplicacao(finalExplicacao);
          setImagemResposta(finalImagem);
        }
      } catch {
        console.warn("Failed to auto-generate explanation");
      }
    }

    const payload = {
      user_id: user.id,
      pergunta: pergunta.trim(),
      resposta1: respostas[0].trim(),
      resposta2: respostas[1].trim(),
      resposta3: respostas[2].trim(),
      resposta4: respostas[3].trim(),
      resposta_correta: correta,
      data_quiz: dataQuiz,
      horario_inicio: horarioInicio,
      horario_fim: horarioFim,
      explicacao: finalExplicacao,
      imagem_resposta: finalImagem,
    };
    if (editingId) {
      const { error } = await supabase
        .from("quiz_agendados")
        .update(payload)
        .eq("id", editingId);
      if (error) toast.error("Erro ao atualizar quiz.");
      else toast.success("Quiz atualizado!");
    } else {
      const { error } = await supabase
        .from("quiz_agendados")
        .insert(payload);
      if (error) toast.error("Erro ao agendar quiz.");
      else toast.success("Quiz agendado!");
    }
    clearForm();
    setSaving(false);
    loadQuizzes();
  };

  const clearForm = () => {
    setPergunta("");
    setRespostas(["", "", "", ""]);
    setCorreta(1);
    setDataQuiz("");
    setHorarioInicio("");
    setHorarioFim("");
    setEditingId(null);
    setSelectedCategory("");
    setExplicacao("");
    setImagemResposta("");
  };

  const handleEdit = (e: QuizAgendado) => {
    setPergunta(e.pergunta);
    setRespostas([e.resposta1, e.resposta2, e.resposta3, e.resposta4]);
    setCorreta(e.resposta_correta);
    setDataQuiz(e.data_quiz);
    setHorarioInicio(e.horario_inicio);
    setHorarioFim(e.horario_fim);
    setEditingId(e.id);
    setSelectedCategory("");
    setExplicacao(e.explicacao || "");
    setImagemResposta(e.imagem_resposta || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    await supabase.from("quiz_agendados").delete().eq("id", id);
    toast.success("Quiz removido.");
    loadQuizzes();
  };

  const handleSelectPrebuilt = (quiz: QuizItem) => {
    setPergunta(quiz.pergunta);
    setRespostas([...quiz.respostas]);
    setCorreta(quiz.correta);
    setEditingId(null);
    setExplicacao(quiz.explicacao || "");
    setImagemResposta(quiz.imagem_url || "");
  };

  return (
    <div className="nexo-scope space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--layout-accent-color, #268ffa), color-mix(in srgb, var(--layout-accent-color, #268ffa) 70%, #000))" }}>
          <HelpCircle size={20} className="text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Quiz</h2>
          <p className="text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Configure perguntas com 4 opções de resposta para exibição no ar</p>
        </div>
      </div>

      {/* XML Link */}
      {user && <XmlLinkRow label="XML QUIZ" permanentUrl={xmlUrl} />}

      {/* Pre-built quizzes by category */}
      <div className="rounded-xl p-4" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 96%, var(--layout-accent-color, #268ffa))", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 12%, transparent)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} style={{ color: "var(--layout-accent-color, #268ffa)" }} />
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Quiz pré-prontos</span>
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
                      await supabase.from("custom_quiz_categories").delete().eq("user_id", user.id).eq("nome", cat);
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
            placeholder="Digite a pergunta do quiz..."
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
        {/* Explicação e Imagem */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide mb-1 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
            Explicação da Resposta
            <span className="font-normal ml-1 opacity-50">(preenchido automaticamente pela IA)</span>
          </label>
          <textarea
            value={explicacao}
            onChange={e => setExplicacao(e.target.value)}
            placeholder="Será gerado automaticamente ao agendar..."
            rows={3}
            className="w-full rounded-lg px-3 py-2 text-sm resize-none"
            style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }}
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide mb-1 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
            URL da Imagem da Resposta
            <span className="font-normal ml-1 opacity-50">(preenchido automaticamente pela IA)</span>
          </label>
          <Input
            value={imagemResposta}
            onChange={e => setImagemResposta(e.target.value)}
            placeholder="Cole a URL da imagem aqui ou use 'Outra imagem'"
            className="text-sm"
            style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }}
          />
          {imagemResposta && (
            <img src={imagemResposta} alt="Preview" className="mt-2 rounded-lg max-h-32 object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
          )}
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={fetchAnotherImage}
              disabled={loadingImage}
              className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md transition disabled:opacity-50"
              style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #268ffa) 15%, transparent)", color: "var(--layout-accent-color, #268ffa)" }}
            >
              {loadingImage ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              Outra imagem
            </button>
            {imagemResposta && (
              <button
                type="button"
                onClick={clearImage}
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md transition"
                style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}
              >
                <X size={11} /> Remover
              </button>
            )}
          </div>
        </div>
        {/* Schedule */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide mb-1 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Data</label>
            <Input type="date" value={dataQuiz} onChange={e => setDataQuiz(e.target.value)} className="text-sm" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }} />
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
      {quizzes.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 12%, transparent)" }}>
          <div className="px-4 py-2.5" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 94%, var(--layout-border-color, #333))" }}>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Quiz Agendados</span>
          </div>
          <div className="divide-y" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 8%, transparent)" }}>
            {quizzes.map(e => (
              <div key={e.id} className="px-4 py-3 flex items-start gap-3" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)" }}>
                {e.imagem_resposta && (
                  <img src={e.imagem_resposta} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 mt-0.5" onError={ev => (ev.currentTarget.style.display = 'none')} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{e.pergunta}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                    {new Date(e.data_quiz + "T12:00:00").toLocaleDateString("pt-BR")} • {e.horario_inicio}–{e.horario_fim} • Correta: {e[`resposta${e.resposta_correta}` as keyof QuizAgendado]}
                  </p>
                  {e.explicacao && (
                    <p className="text-[10px] mt-1 line-clamp-2" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>{e.explicacao}</p>
                  )}
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
                O sistema gerará 5 quiz automaticamente, atualizando diariamente.
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
                    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-quiz`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ categoria: name }),
                    }
                  );
                  const generatedQuizzes = await res.json();
                  if (Array.isArray(generatedQuizzes) && generatedQuizzes.length > 0) {
                    const today = todayInBrasilia();
                    if (user) {
                      await supabase.from("custom_quiz_categories").insert({
                        user_id: user.id,
                        nome: name,
                        quizzes: generatedQuizzes,
                        generated_date: today,
                      } as any);
                    }
                    setCustomCategories(prev => ({ ...prev, [name]: generatedQuizzes }));
                    setShowAddCategory(false);
                    setNewCategoryName("");
                    setSelectedCategory(name);
                    toast.success(`Categoria "${name}" adicionada com 5 quiz!`);
                  } else {
                    toast.error("Não foi possível gerar quiz. Tente outro tema.");
                  }
                } catch {
                  toast.error("Erro ao gerar quiz.");
                } finally {
                  setLoadingCategory(false);
                }
              }}
              className="w-full"
              style={{ backgroundColor: "var(--layout-accent-color, #268ffa)" }}
            >
              {loadingCategory ? <><Loader2 size={14} className="mr-1 animate-spin" /> Gerando quiz...</> : <><Plus size={14} className="mr-1" /> Adicionar Categoria</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
