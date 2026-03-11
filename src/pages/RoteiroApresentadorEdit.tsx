import { useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lock, Check, History, Save, Pencil, Bold, Underline, AlignLeft, AlignCenter, AlignRight, List, ListOrdered } from "lucide-react";
import { toast } from "sonner";

interface Participante {
  nome: string;
  cargo?: string;
  categoria?: string;
}

export default function RoteiroApresentadorEdit() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [authed, setAuthed] = useState(false);
  const [roteiro, setRoteiro] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [historico, setHistorico] = useState<any[]>([]);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [editingPart, setEditingPart] = useState<number | null>(null);
  const [fontSize, setFontSize] = useState("14");
  const [perguntaCount, setPerguntaCount] = useState(1);
  const editorRef = useRef<HTMLDivElement>(null);

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const action = target.getAttribute("data-action");
    if (!action || !editorRef.current) return;

    const table = editorRef.current.querySelector("table");
    if (!table) return;

    const tdS = "border:1px solid rgba(13,4,70,0.12);padding:8px 10px";

    if (action === "add-pergunta") {
      const allPerguntas = Array.from(table.querySelectorAll("tr[data-pergunta]"));
      const newNum = allPerguntas.length + 1;
      setPerguntaCount(newNum);
      const insertAfter = allPerguntas.length > 0
        ? allPerguntas[allPerguntas.length - 1]
        : Array.from(table.querySelectorAll("tr")).find(r => r.innerHTML.includes("ENTREVISTA")) || null;
      if (insertAfter) {
        const newRow = document.createElement("tr");
        newRow.setAttribute("data-pergunta", String(newNum));
        newRow.innerHTML = `<td style="${tdS}">--:--</td><td style="${tdS};font-weight:600">PERGUNTA ${newNum}</td><td style="${tdS}">[Insira a pergunta aqui]</td>`;
        insertAfter.insertAdjacentElement("afterend", newRow);
        const actionRow = table.querySelector("tr[data-action-row]");
        if (actionRow) newRow.insertAdjacentElement("afterend", actionRow);
      }
    } else if (action === "remove-pergunta") {
      const allPerguntas = Array.from(table.querySelectorAll("tr[data-pergunta]"));
      if (allPerguntas.length <= 1) return;
      allPerguntas[allPerguntas.length - 1].remove();
      setPerguntaCount(prev => Math.max(1, prev - 1));
    }
  };

  const handleLogin = async () => {
    if (!token) { toast.error("Link inválido"); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("roteiros")
      .select("*")
      .eq("share_token", token)
      .maybeSingle();

    if (error || !data) {
      toast.error("Roteiro não encontrado");
      setLoading(false);
      return;
    }

    const expectedLogin = (data.share_login || "").toLowerCase().trim();
    if (loginUser.toLowerCase().trim() !== expectedLogin || loginPass !== "edit123") {
      toast.error("Login ou senha inválidos");
      setLoading(false);
      return;
    }

    setRoteiro(data);
    setAuthed(true);
    setLoading(false);

    let parts: Participante[] = [];
    try {
      parts = typeof data.participantes === "string" ? JSON.parse(data.participantes) : data.participantes || [];
    } catch { parts = []; }
    setParticipantes(parts);

    fetchHistorico(data.user_id);

    setTimeout(() => {
      if (editorRef.current) editorRef.current.innerHTML = data.conteudo_html || "";
    }, 100);
  };

  const fetchHistorico = async (userId: string) => {
    const { data } = await supabase
      .from("roteiros")
      .select("*")
      .eq("user_id", userId)
      .order("editado_at", { ascending: false })
      .limit(10);
    setHistorico(data || []);
  };

  const updateParticipante = (idx: number, field: keyof Participante, value: string) => {
    setParticipantes((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };

  const handleSave = async () => {
    if (!roteiro || !editorRef.current) return;
    setSaving(true);
    const { error } = await supabase
      .from("roteiros")
      .update({
        conteudo_html: editorRef.current.innerHTML,
        participantes: participantes as any,
        apresentador_editado: true,
        editado_at: new Date().toISOString(),
      })
      .eq("id", roteiro.id);

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar");
    } else {
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
      fetchHistorico(roteiro.user_id);
    }
  };

  // Login screen
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "linear-gradient(135deg, #004dc0, #0c0440)" }}>
        <div className="w-full max-w-sm rounded-2xl p-8" style={{ backgroundColor: "#ffffff" }}>
          <div className="text-center mb-6">
            <div className="h-12 w-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: "rgba(38,143,250,0.1)" }}>
              <Lock size={20} style={{ color: "#268ffa" }} />
            </div>
            <h1 className="text-lg font-bold" style={{ color: "#0d0446" }}>Roteiro do Programa</h1>
            <p className="text-xs mt-1" style={{ color: "rgba(13,4,70,0.5)" }}>Acesse com suas credenciais</p>
          </div>
          <div className="space-y-3">
            <input value={loginUser} onChange={(e) => setLoginUser(e.target.value)} placeholder="seu nome" className="w-full px-4 py-2.5 rounded-xl text-xs outline-none" style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.1)", color: "#0d0446" }} onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
            <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder="senha" className="w-full px-4 py-2.5 rounded-xl text-xs outline-none" style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.1)", color: "#0d0446" }} onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
            <button onClick={handleLogin} disabled={loading || !loginUser.trim() || !loginPass.trim()} className="w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-40" style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)" }}>
              {loading ? "verificando..." : "entrar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const dataFormatada = (() => {
    try { return format(new Date(roteiro.data_programa), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }); }
    catch { return roteiro.data_programa; }
  })();

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f4f6fb" }}>
      {/* Header */}
      <div className="px-6 py-4" style={{ backgroundColor: "#0d0446" }}>
        <h1 className="text-sm font-bold text-white uppercase">{roteiro.titulo || "Roteiro"}</h1>
        <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>
          {roteiro.programa_nome} · {roteiro.estudio && `Estúdio ${roteiro.estudio} · `}{dataFormatada} {roteiro.horario && `às ${roteiro.horario}`}
        </p>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Assunto */}
        {roteiro.subtitulo && (
          <div className="mb-4 px-4 py-3 rounded-xl" style={{ backgroundColor: "rgba(38,143,250,0.06)", borderLeft: "3px solid #268ffa" }}>
            <p className="text-xs font-bold uppercase" style={{ color: "#268ffa" }}>Assunto da entrevista</p>
            <p className="text-sm font-bold mt-0.5" style={{ color: "#0d0446" }}>{roteiro.subtitulo}</p>
          </div>
        )}

        {/* Participantes editáveis */}
        {participantes.length > 0 && (
          <div className="mb-4 rounded-xl p-4" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.08)" }}>
            <p className="text-xs font-bold uppercase mb-3" style={{ color: "rgba(13,4,70,0.5)" }}>Participantes</p>
            <div className="space-y-2">
              {participantes.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  {editingPart === i ? (
                    <>
                      <input value={p.nome} onChange={(e) => updateParticipante(i, "nome", e.target.value)} className="flex-1 px-3 py-1.5 rounded-lg text-xs outline-none" style={{ border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446" }} placeholder="Nome" />
                      <input value={p.cargo || p.categoria || ""} onChange={(e) => updateParticipante(i, "cargo", e.target.value)} className="w-32 px-3 py-1.5 rounded-lg text-xs outline-none" style={{ border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446" }} placeholder="Cargo" />
                      <button onClick={() => setEditingPart(null)} className="p-1 rounded" style={{ color: "#268ffa" }}><Check size={14} /></button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: "rgba(13,4,70,0.05)", color: "#0d0446" }}>
                        {p.nome}{p.cargo ? ` · ${p.cargo}` : p.categoria ? ` · ${p.categoria}` : ""}
                      </span>
                      <button onClick={() => setEditingPart(i)} className="p-1 rounded hover:opacity-70" style={{ color: "rgba(13,4,70,0.4)" }}><Pencil size={12} /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conteúdo editável do roteiro */}
        <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.08)" }}>
          <p className="text-xs font-bold uppercase mb-3" style={{ color: "#0d0446" }}>Roteiro do programa</p>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-1 mb-3 pb-3" style={{ borderBottom: "1px solid rgba(13,4,70,0.08)" }}>
            <select
              value={fontSize}
              onChange={e => {
                setFontSize(e.target.value);
                document.execCommand("fontSize", false, "7");
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                  const fonts = editorRef.current?.querySelectorAll('font[size="7"]');
                  fonts?.forEach(f => {
                    const span = document.createElement("span");
                    span.style.fontSize = e.target.value + "px";
                    span.innerHTML = f.innerHTML;
                    f.replaceWith(span);
                  });
                }
              }}
              className="h-8 px-2 rounded-lg text-xs outline-none cursor-pointer"
              style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.08)", color: "#0d0446" }}
            >
              <option value="12">12px</option>
              <option value="14">14px</option>
              <option value="16">16px</option>
              <option value="18">18px</option>
              <option value="20">20px</option>
              <option value="24">24px</option>
              <option value="28">28px</option>
            </select>

            <div className="w-px h-5 mx-1" style={{ backgroundColor: "rgba(13,4,70,0.1)" }} />

            <button type="button" onClick={() => document.execCommand("bold")} className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(13,4,70,0.04)" }} title="Negrito">
              <Bold size={14} style={{ color: "#0d0446" }} />
            </button>
            <button type="button" onClick={() => document.execCommand("underline")} className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(13,4,70,0.04)" }} title="Sublinhado">
              <Underline size={14} style={{ color: "#0d0446" }} />
            </button>

            <div className="w-px h-5 mx-1" style={{ backgroundColor: "rgba(13,4,70,0.1)" }} />

            <button type="button" onClick={() => document.execCommand("justifyLeft")} className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(13,4,70,0.04)" }} title="Alinhar à esquerda">
              <AlignLeft size={14} style={{ color: "#0d0446" }} />
            </button>
            <button type="button" onClick={() => document.execCommand("justifyCenter")} className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(13,4,70,0.04)" }} title="Centralizar">
              <AlignCenter size={14} style={{ color: "#0d0446" }} />
            </button>
            <button type="button" onClick={() => document.execCommand("justifyRight")} className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(13,4,70,0.04)" }} title="Alinhar à direita">
              <AlignRight size={14} style={{ color: "#0d0446" }} />
            </button>

            <div className="w-px h-5 mx-1" style={{ backgroundColor: "rgba(13,4,70,0.1)" }} />

            <button type="button" onClick={() => document.execCommand("insertUnorderedList")} className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(13,4,70,0.04)" }} title="Lista com marcadores">
              <List size={14} style={{ color: "#0d0446" }} />
            </button>
            <button type="button" onClick={() => document.execCommand("insertOrderedList")} className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(13,4,70,0.04)" }} title="Lista numerada">
              <ListOrdered size={14} style={{ color: "#0d0446" }} />
            </button>
          </div>

          {/* Editor */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="w-full min-h-[300px] text-sm outline-none prose prose-sm max-w-none"
            style={{ color: "#0d0446", lineHeight: "1.7" }}
          />
        </div>

        {/* Save button */}
        <button onClick={handleSave} disabled={saving} className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", boxShadow: "0 4px 16px rgba(38,143,250,0.3)" }}>
          <Save size={14} />
          {saving ? "salvando..." : "programa ok"}
        </button>

        {savedMsg && (
          <div className="mt-3 rounded-xl p-3 flex items-center gap-2" style={{ backgroundColor: "rgba(38,143,250,0.1)", border: "1px solid rgba(38,143,250,0.3)" }}>
            <Check size={14} style={{ color: "#268ffa" }} />
            <p className="text-xs font-semibold" style={{ color: "#268ffa" }}>Roteiro salvo com sucesso!</p>
          </div>
        )}

        {/* Histórico */}
        {historico.length > 0 && (
          <div className="mt-6 rounded-xl p-4" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.08)" }}>
            <div className="flex items-center gap-2 mb-3">
              <History size={14} style={{ color: "#268ffa" }} />
              <p className="text-xs font-bold" style={{ color: "#0d0446" }}>Últimos roteiros</p>
            </div>
            <div className="space-y-2">
              {historico.map((r) => (
                <div key={r.id} className="px-3 py-2.5 rounded-lg flex items-center justify-between" style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid rgba(13,4,70,0.06)" }}>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: "#0d0446" }}>{r.programa_nome || "Roteiro"}</p>
                    <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.45)" }}>
                      {r.editado_at ? format(new Date(r.editado_at), "dd/MM/yyyy 'às' HH:mm") : r.created_at ? format(new Date(r.created_at), "dd/MM/yyyy") : ""}
                      {r.titulo ? ` · ${r.titulo}` : ""}
                    </p>
                  </div>
                  {r.apresentador_editado && (
                    <span className="px-2 py-1 rounded-md text-[9px] font-bold uppercase" style={{ backgroundColor: "rgba(34,197,94,0.1)", color: "#16a34a" }}>editado</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
