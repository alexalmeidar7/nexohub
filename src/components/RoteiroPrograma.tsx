import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, FileText, Building2, Clock, Plus, X, Download, UserPlus, Check, Bold, Underline, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Type } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

const NoticiasPanel = lazy(() => import("./NoticiasPanel"));

interface Apresentador {
  id: string;
  nome: string;
  cargo: string;
  instagram?: string;
  ativo: boolean;
}

interface Programa {
  id: string;
  nome: string;
  estudio: string;
  tipo_programa: string | null;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: string[];
  apresentador_id: string | null;
}

export default function RoteiroPrograma() {
  const { user } = useAuth();
  const [estudio, setEstudio] = useState("");
  const [programaNome, setProgramaNome] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [horario, setHorario] = useState("");
  const [tipoPrograma, setTipoPrograma] = useState("");
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const [loading, setLoading] = useState(true);
  const [estudios, setEstudios] = useState<string[]>([]);
  const [tiposPrograma, setTiposPrograma] = useState<string[]>([]);
  const [showRoteiro, setShowRoteiro] = useState(false);
  const [roteiroTitulo, setRoteiroTitulo] = useState("");
  const [roteiroSubtitulo, setRoteiroSubtitulo] = useState("");
  const [roteiroTexto, setRoteiroTexto] = useState("");
  const [participantes, setParticipantes] = useState<{ nome: string; categoria: string; cargo: string; instagram: string }[]>([]);
  
  const [newNome, setNewNome] = useState("");
  const [newCategoria, setNewCategoria] = useState("Apresentador(a)");
  const [newCargoText, setNewCargoText] = useState("");
  const [newInstagram, setNewInstagram] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedFromDb, setSelectedFromDb] = useState(false);
  const [cadastroMsg, setCadastroMsg] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isAgendado = selectedDate > new Date(new Date().toDateString());

  const categorias = ["Apresentador(a)", "Jornalista", "Convidado(a)"];

  // Filter suggestions based on typed name
  const nameSuggestions = newNome.trim().length >= 2
    ? apresentadores.filter(a => a.nome.toLowerCase().includes(newNome.toLowerCase().trim()))
    : [];

  // Derive tipos filtered by estudio
  const tiposFiltrados = estudio
    ? [...new Set(programas.filter(p => p.estudio === estudio).map(p => p.tipo_programa).filter(Boolean))] as string[]
    : [...new Set(programas.map(p => p.tipo_programa).filter(Boolean))] as string[];

  // Filter programs by estudio + tipo
  const programasFiltrados = programas.filter(p => {
    if (estudio && p.estudio !== estudio) return false;
    if (tipoPrograma && p.tipo_programa !== tipoPrograma) return false;
    return true;
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const [progRes, apresRes] = await Promise.all([
        supabase.from("programas").select("id, nome, estudio, tipo_programa, horario_inicio, horario_fim, dias_semana, apresentador_id").eq("ativo", true),
        supabase.from("apresentadores").select("id, nome, cargo, instagram, ativo").eq("ativo", true),
      ]);
      const progs = progRes.data || [];
      const apres = apresRes.data || [];
      setProgramas(progs);
      setApresentadores(apres);

      const uniqueEstudios = [...new Set(progs.map(p => p.estudio).filter(Boolean))] as string[];
      setEstudios(uniqueEstudios);

      setLoading(false);
    };
    load();
  }, [user]);

  const handleEstudioChange = (val: string) => {
    setEstudio(val);
    setProgramaNome("");
    setHorario("");
    // Auto-select tipo if only one option
    const tipos = val
      ? [...new Set(programas.filter(p => p.estudio === val).map(p => p.tipo_programa).filter(Boolean))] as string[]
      : [...new Set(programas.map(p => p.tipo_programa).filter(Boolean))] as string[];
    setTipoPrograma(tipos.length === 1 ? tipos[0] : "");
  };

  const handleTipoChange = (tipo: string) => {
    setTipoPrograma(tipo);
    setProgramaNome("");
    setHorario("");
  };

  const handleProgramaChange = (nome: string) => {
    setProgramaNome(nome);
    const prog = programas.find(p => p.nome === nome);
    if (prog) {
      if (prog.horario_inicio) {
        setHorario(prog.horario_inicio.slice(0, 5));
      }
    }
  };

  const handleMontarRoteiro = () => {
    const prog = programas.find(p => p.nome === programaNome);
    const defaultParticipantes: { nome: string; categoria: string; cargo: string; instagram: string }[] = [];
    if (prog?.apresentador_id) {
      const apres = apresentadores.find(a => a.id === prog.apresentador_id);
      if (apres) {
        defaultParticipantes.push({ nome: apres.nome, categoria: apres.cargo || "Apresentador(a)", cargo: "", instagram: (apres as any).instagram || "" });
      }
    }
    setParticipantes(defaultParticipantes);
    setRoteiroTitulo("");
    setRoteiroSubtitulo("");
    setRoteiroTexto("");
    setShowRoteiro(true);
  };

  const selectSuggestion = (apres: Apresentador) => {
    setNewNome(apres.nome);
    setNewCategoria(apres.cargo || "Apresentador(a)");
    setNewCargoText("");
    setNewInstagram(apres.instagram || "");
    setSelectedFromDb(true);
    setShowSuggestions(false);
  };

  const addParticipante = async () => {
    if (!newNome.trim()) return;
    const isNew = !selectedFromDb && !apresentadores.some(a => a.nome.toLowerCase() === newNome.trim().toLowerCase());
    
    setParticipantes(prev => [...prev, { nome: newNome.trim(), categoria: newCategoria, cargo: newCargoText.trim(), instagram: newInstagram.trim() }]);
    
    // If not from DB, register as new apresentador
    if (isNew && user) {
      await supabase.from("apresentadores").insert({
        nome: newNome.trim(),
        cargo: newCategoria,
        instagram: newInstagram.trim(),
        user_id: user.id,
        ativo: true,
      });
      const { data } = await supabase.from("apresentadores").select("id, nome, cargo, instagram, ativo").eq("ativo", true);
      if (data) setApresentadores(data);
      setCadastroMsg(true);
      setTimeout(() => setCadastroMsg(false), 4000);
    }
    
    setNewNome("");
    setNewCategoria("Apresentador(a)");
    setNewCargoText("");
    setNewInstagram("");
    setSelectedFromDb(false);
  };

  const removeParticipante = (idx: number) => {
    setParticipantes(prev => prev.filter((_, i) => i !== idx));
  };

  if (loading) return <ModulePageSkeleton />;

  return (
    <div className="animate-fade-in space-y-4">
      {/* Header Card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#d9e9fa", boxShadow: "0 8px 32px rgba(13,4,70,0.12)", padding: "20px" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(13,4,70,0.08)" }}>
              <FileText size={20} style={{ color: "#0d0446" }} />
            </div>
            <div>
              <h3 className="text-lg font-bold" style={{ color: "#0d0446" }}>Roteiro de Programa</h3>
              <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.5)" }}>
                Estruture o roteiro do seu programa
              </p>
            </div>
          </div>
        </div>

        {/* Form Fields - Row 1: Estúdio, Tipo, Programa */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Estúdio */}
          <div>
            <label className="text-[11px] font-bold mb-1 block" style={{ color: "#0d0446" }}>
              <Building2 size={11} className="inline mr-1" />Estúdio
            </label>
            <select
              value={estudio}
              onChange={e => handleEstudioChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none transition-colors"
              style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446" }}
            >
              <option value="">Selecione o estúdio</option>
              {estudios.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          {/* Tipo de Programa (filtro) */}
          <div>
            <label className="text-[11px] font-bold mb-1 block" style={{ color: "#0d0446" }}>Tipo de Programa</label>
            <select
              value={tipoPrograma}
              onChange={e => handleTipoChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none transition-colors"
              style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446" }}
            >
              <option value="">Todos os tipos</option>
              {tiposFiltrados.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Programa (filtrado por tipo) */}
          <div>
            <label className="text-[11px] font-bold mb-1 block" style={{ color: "#0d0446" }}>
              <FileText size={11} className="inline mr-1" />Programa
            </label>
            <select
              value={programaNome}
              onChange={e => handleProgramaChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none transition-colors"
              style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446" }}
            >
              <option value="">Selecione o programa</option>
              {programasFiltrados.map(p => <option key={p.id} value={p.nome}>{p.nome}</option>)}
            </select>
          </div>
        </div>

        {/* Form Fields - Row 2: Data, Horário */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Data */}
          <div>
            <label className="text-[11px] font-bold mb-1 block" style={{ color: "#0d0446" }}>
              <CalendarIcon size={11} className="inline mr-1" />Data
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="w-full px-3 py-2 rounded-lg text-xs text-left flex items-center gap-2 outline-none transition-colors"
                  style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446" }}
                >
                  <CalendarIcon size={12} style={{ color: "#268ffa" }} />
                  {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border-none shadow-xl bg-white" align="start" style={{ borderRadius: "16px", overflow: "hidden" }}>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && setSelectedDate(d)}
                  locale={ptBR}
                  className="p-4 pointer-events-auto"
                  classNames={{
                    months: "flex flex-col space-y-4",
                    month: "space-y-3",
                    caption: "flex justify-center pt-1 relative items-center",
                    caption_label: "text-sm font-bold",
                    nav: "space-x-1 flex items-center",
                    nav_button: "h-7 w-7 rounded-full flex items-center justify-center hover:opacity-100 transition-all",
                    nav_button_previous: "absolute left-1",
                    nav_button_next: "absolute right-1",
                    table: "w-full border-collapse",
                    head_row: "flex",
                    head_cell: "rounded-md w-9 font-semibold text-[0.7rem] uppercase",
                    row: "flex w-full mt-1",
                    cell: "h-9 w-9 text-center text-sm p-0 relative rounded-full",
                    day: "h-9 w-9 p-0 font-medium rounded-full transition-all hover:bg-[rgba(38,143,250,0.12)]",
                    day_selected: "bg-[#268ffa] text-white hover:bg-[#268ffa] focus:bg-[#268ffa] font-bold shadow-md",
                    day_today: "bg-[rgba(13,4,70,0.08)] font-bold",
                    day_outside: "opacity-30",
                    day_disabled: "opacity-30",
                    day_hidden: "invisible",
                  }}
                  styles={{
                    caption_label: { color: "#0d0446" },
                    head_cell: { color: "rgba(13,4,70,0.45)" },
                    day: { color: "#0d0446" },
                    nav_button: { color: "#268ffa", backgroundColor: "rgba(38,143,250,0.08)" },
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Horário */}
          <div>
            <label className="text-[11px] font-bold mb-1 block" style={{ color: "#0d0446" }}>
              <Clock size={11} className="inline mr-1" />Horário
            </label>
            <input
              type="time"
              value={horario}
              onChange={e => setHorario(e.target.value)}
              placeholder="Ex: 08:00"
              className="w-full px-3 py-2 rounded-lg text-xs outline-none transition-colors"
              style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446" }}
            />
          </div>
        </div>

      </div>

      {/* Botão Montar Roteiro */}
      {!showRoteiro && programaNome && (
        <button
          onClick={handleMontarRoteiro}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff", boxShadow: "0 4px 16px rgba(38,143,250,0.3)" }}
        >
          Montar Roteiro
        </button>
      )}

      {/* Roteiro Form */}
      {showRoteiro && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "#d9e9fa", boxShadow: "0 8px 32px rgba(13,4,70,0.12)", padding: "24px" }}>
          {/* Header */}
          <div className="mb-5">
            <p className="text-xs font-bold" style={{ color: "#0d0446" }}>roteiro para o programa</p>
            <h2 className="text-2xl font-bold" style={{ color: "#0d0446" }}>{programaNome}</h2>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold mt-1" style={{ backgroundColor: "#268ffa", color: "#ffffff" }}>
              estúdio {estudio || "—"}
            </span>
            <p className="text-xs mt-2" style={{ color: "rgba(13,4,70,0.5)" }}>
              programa para o dia:<br />
              {format(selectedDate, "dd/MM/yy", { locale: ptBR })} às {horario || "—"}
            </p>
          </div>

          {/* Assunto */}
          <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.08)" }}>
            <label className="text-xs font-semibold mb-2 block" style={{ color: "rgba(13,4,70,0.5)" }}>assunto do {tipoPrograma?.toLowerCase() || "programa"}</label>
            <input
              value={roteiroTitulo}
              onChange={e => setRoteiroTitulo(e.target.value)}
              placeholder="título"
              className="w-full px-3 py-2 rounded-lg text-sm font-bold outline-none mb-2"
              style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.08)", color: "#0d0446" }}
            />
            <input
              value={roteiroSubtitulo}
              onChange={e => setRoteiroSubtitulo(e.target.value)}
              placeholder="subtítulo"
              className="w-full px-3 py-2 rounded-lg text-xs outline-none"
              style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.08)", color: "#0d0446" }}
            />
          </div>

          {/* Participantes */}
          <div className="mb-4">
            <label className="text-xs font-semibold mb-2 block" style={{ color: "rgba(13,4,70,0.5)" }}>participantes</label>
            <div className="space-y-2">
              {participantes.map((p, idx) => (
                <div key={idx} className="rounded-xl p-3" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.08)" }}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-[10px] font-bold mb-1" style={{ color: "#268ffa" }}>Participante {idx + 1}</p>
                      <p className="text-xs font-bold" style={{ color: "#0d0446" }}>{p.nome}</p>
                      <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.5)" }}>{p.categoria}{p.cargo ? ` · ${p.cargo}` : ""}</p>
                      {p.instagram && <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.4)" }}>@{p.instagram.replace("@", "")}</p>}
                    </div>
                    <button onClick={() => removeParticipante(idx)} className="hover:opacity-70 mt-1">
                      <X size={12} style={{ color: "rgba(13,4,70,0.3)" }} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Cadastro message */}
              {cadastroMsg && (
                <div className="rounded-xl p-3 flex items-center gap-2" style={{ backgroundColor: "rgba(38,143,250,0.1)", border: "1px solid rgba(38,143,250,0.3)" }}>
                  <Check size={14} style={{ color: "#268ffa" }} />
                  <p className="text-xs font-semibold" style={{ color: "#268ffa" }}>Cadastrei esse participante na nossa agenda!</p>
                </div>
              )}

              {/* Inline add participant fields */}
              <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: "#ffffff", border: "1px dashed rgba(13,4,70,0.15)" }}>
                <p className="text-[10px] font-bold" style={{ color: "#268ffa" }}>Participante {participantes.length + 1}</p>
                
                {/* Nome with autocomplete */}
                <div className="relative">
                  <input
                    ref={nameInputRef}
                    value={newNome}
                    onChange={e => {
                      setNewNome(e.target.value);
                      setSelectedFromDb(false);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder="nome"
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.08)", color: "#0d0446" }}
                  />
                  {showSuggestions && nameSuggestions.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 mt-1 rounded-lg overflow-hidden shadow-lg" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.12)" }}>
                      {nameSuggestions.map(s => (
                        <button
                          key={s.id}
                          onMouseDown={() => selectSuggestion(s)}
                          className="w-full text-left px-3 py-2 hover:bg-[rgba(38,143,250,0.08)] transition-colors flex items-center gap-2"
                        >
                          <UserPlus size={11} style={{ color: "#268ffa" }} />
                          <div>
                            <p className="text-xs font-semibold" style={{ color: "#0d0446" }}>{s.nome}</p>
                            <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.4)" }}>{s.cargo}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Categoria (same as cadastros) */}
                <select
                  value={newCategoria}
                  onChange={e => setNewCategoria(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                  style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.08)", color: "#0d0446" }}
                >
                  {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                {/* Cargo */}
                <input
                  value={newCargoText}
                  onChange={e => setNewCargoText(e.target.value)}
                  placeholder="cargo (ex: Diretor, Produtor...)"
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                  style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.08)", color: "#0d0446" }}
                />

                <input
                  value={newInstagram}
                  onChange={e => setNewInstagram(e.target.value)}
                  placeholder="rede social (@usuario)"
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                  style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.08)", color: "#0d0446" }}
                />
                <button
                  onClick={addParticipante}
                  disabled={!newNome.trim()}
                  className="w-full py-2 rounded-lg text-xs font-bold transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff" }}
                >
                  <Plus size={12} className="inline mr-1" />adicionar participante
                </button>
              </div>
            </div>
          </div>

          {/* Texto Roteiro */}
          <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.08)" }}>
            <textarea
              value={roteiroTexto}
              onChange={e => setRoteiroTexto(e.target.value)}
              placeholder="Texto roteiro"
              rows={14}
              className="w-full text-xs outline-none resize-none"
              style={{ color: "#0d0446" }}
            />
          </div>

          {/* Exportar Roteiro */}
          <button
            className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff", boxShadow: "0 4px 16px rgba(38,143,250,0.3)" }}
          >
            <Download size={14} />
            exportar roteiro
          </button>
        </div>
      )}

      {/* Conditional: Jornalístico shows NoticiasPanel */}
      {tipoPrograma === "Jornalístico" && (
        <Suspense fallback={<ModulePageSkeleton />}>
          <NoticiasPanel />
        </Suspense>
      )}

    </div>
  );
}
