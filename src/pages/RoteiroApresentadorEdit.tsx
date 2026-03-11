import { useState, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Lock, Check, History, ChevronUp, ChevronDown, Save, Plus, Trash2, Pencil,
} from "lucide-react";
import { toast } from "sonner";

interface Pergunta {
  id: string;
  texto: string;
}

interface Participante {
  nome: string;
  cargo?: string;
  categoria?: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/** Parse the HTML table content into structured questions */
function parsePerguntas(html: string): { perguntas: Pergunta[]; headerHtml: string } {
  const div = document.createElement("div");
  div.innerHTML = html;
  const rows = div.querySelectorAll("tr");
  const perguntas: Pergunta[] = [];
  let headerHtml = "";

  rows.forEach((row) => {
    const cells = row.querySelectorAll("td, th");
    // Detect question rows: element column contains PERGUNTA
    const elementCell = cells[1];
    if (elementCell && elementCell.textContent?.toUpperCase().includes("PERGUNTA")) {
      const descCell = cells[2];
      perguntas.push({ id: uid(), texto: descCell?.innerHTML || "" });
    }
  });

  // Keep the full HTML as header (we'll rebuild on save)
  headerHtml = html;
  return { perguntas, headerHtml };
}

/** Rebuild the HTML injecting updated questions and participants */
function rebuildHtml(
  originalHtml: string,
  perguntas: Pergunta[],
  participantes: Participante[]
): string {
  const div = document.createElement("div");
  div.innerHTML = originalHtml;
  const rows = div.querySelectorAll("tr");

  // Find question rows and remove them
  const questionRows: Element[] = [];
  rows.forEach((row) => {
    const cells = row.querySelectorAll("td, th");
    const el = cells[1];
    if (el && el.textContent?.toUpperCase().includes("PERGUNTA")) {
      questionRows.push(row);
    }
  });

  // Find insertion point (before OBSERVAÇÕES or last row)
  let insertBefore: Element | null = null;
  rows.forEach((row) => {
    const cells = row.querySelectorAll("td, th");
    const el = cells[1];
    if (el && (el.textContent?.toUpperCase().includes("OBSERVA") || el.textContent?.toUpperCase().includes("ENCERRAMENTO"))) {
      if (!insertBefore) insertBefore = row;
    }
  });

  // Remove old question rows
  questionRows.forEach((r) => r.remove());

  // Build new question rows
  const table = div.querySelector("table");
  if (table) {
    const tbody = table.querySelector("tbody") || table;
    perguntas.forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center;font-size:12px;">--:--</td><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:bold;font-size:12px;text-transform:uppercase;">PERGUNTA ${i + 1}</td><td style="padding:6px 10px;border:1px solid #e5e7eb;font-size:12px;">${p.texto}</td>`;
      if (insertBefore && insertBefore.parentNode) {
        insertBefore.parentNode.insertBefore(tr, insertBefore);
      } else {
        tbody.appendChild(tr);
      }
    });
  }

  // Update participant names in the HTML (look for PARTICIPANTES section)
  // We also update a data attribute or known pattern
  return div.innerHTML;
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

  // Structured data
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [editingPart, setEditingPart] = useState<number | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

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

    // Parse participantes
    let parts: Participante[] = [];
    try {
      parts = typeof data.participantes === "string" ? JSON.parse(data.participantes) : data.participantes || [];
    } catch { parts = []; }
    setParticipantes(parts);

    // Parse perguntas from HTML
    const { perguntas: parsed } = parsePerguntas(data.conteudo_html || "");
    if (parsed.length > 0) {
      setPerguntas(parsed);
    } else {
      setPerguntas([{ id: uid(), texto: "" }]);
    }

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

  // Question management
  const addPergunta = () => setPerguntas((prev) => [...prev, { id: uid(), texto: "" }]);
  const removePergunta = (id: string) => setPerguntas((prev) => prev.filter((p) => p.id !== id));
  const updatePergunta = (id: string, texto: string) =>
    setPerguntas((prev) => prev.map((p) => (p.id === id ? { ...p, texto } : p)));
  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setPerguntas((prev) => {
      const arr = [...prev];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return arr;
    });
  };
  const moveDown = (idx: number) => {
    setPerguntas((prev) => {
      if (idx >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return arr;
    });
  };

  // Participant editing
  const updateParticipante = (idx: number, field: keyof Participante, value: string) => {
    setParticipantes((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };

  const handleSave = async () => {
    if (!roteiro) return;
    setSaving(true);

    // Rebuild HTML with updated questions
    const updatedHtml = editorRef.current
      ? rebuildHtml(editorRef.current.innerHTML, perguntas, participantes)
      : roteiro.conteudo_html;

    const { error } = await supabase
      .from("roteiros")
      .update({
        conteudo_html: updatedHtml,
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
      // Update local editorRef
      if (editorRef.current) editorRef.current.innerHTML = updatedHtml;
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

  // Editor screen
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
                      <input
                        value={p.nome}
                        onChange={(e) => updateParticipante(i, "nome", e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs outline-none"
                        style={{ border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446" }}
                        placeholder="Nome"
                      />
                      <input
                        value={p.cargo || p.categoria || ""}
                        onChange={(e) => updateParticipante(i, "cargo", e.target.value)}
                        className="w-32 px-3 py-1.5 rounded-lg text-xs outline-none"
                        style={{ border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446" }}
                        placeholder="Cargo"
                      />
                      <button onClick={() => setEditingPart(null)} className="p-1 rounded" style={{ color: "#268ffa" }}>
                        <Check size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: "rgba(13,4,70,0.05)", color: "#0d0446" }}>
                        {p.nome}{p.cargo ? ` · ${p.cargo}` : p.categoria ? ` · ${p.categoria}` : ""}
                      </span>
                      <button onClick={() => setEditingPart(i)} className="p-1 rounded hover:opacity-70" style={{ color: "rgba(13,4,70,0.4)" }}>
                        <Pencil size={12} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Perguntas gerenciáveis */}
        <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.08)" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase" style={{ color: "#0d0446" }}>Perguntas</p>
            <button onClick={addPergunta} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:opacity-80" style={{ backgroundColor: "rgba(38,143,250,0.1)", color: "#268ffa" }}>
              <Plus size={12} /> adicionar pergunta
            </button>
          </div>
          <div className="space-y-2">
            {perguntas.map((p, idx) => (
              <div key={p.id} className="flex items-start gap-2 group">
                <div className="flex flex-col gap-0.5 pt-2">
                  <button onClick={() => moveUp(idx)} disabled={idx === 0} className="p-0.5 rounded hover:opacity-70 disabled:opacity-20" style={{ color: "rgba(13,4,70,0.4)" }}>
                    <ChevronUp size={14} />
                  </button>
                  <button onClick={() => moveDown(idx)} disabled={idx === perguntas.length - 1} className="p-0.5 rounded hover:opacity-70 disabled:opacity-20" style={{ color: "rgba(13,4,70,0.4)" }}>
                    <ChevronDown size={14} />
                  </button>
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase mb-1" style={{ color: "rgba(13,4,70,0.4)" }}>Pergunta {idx + 1}</p>
                  <textarea
                    value={p.texto}
                    onChange={(e) => updatePergunta(p.id, e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
                    style={{ border: "1px solid rgba(13,4,70,0.1)", color: "#0d0446", backgroundColor: "rgba(13,4,70,0.02)" }}
                    placeholder="Digite a pergunta..."
                  />
                </div>
                {perguntas.length > 1 && (
                  <button onClick={() => removePergunta(p.id)} className="p-1.5 mt-5 rounded hover:opacity-70" style={{ color: "#ef4444" }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Conteúdo completo (hidden, used for rebuild) */}
        <div ref={editorRef} className="hidden" dangerouslySetInnerHTML={{ __html: roteiro.conteudo_html || "" }} />

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", boxShadow: "0 4px 16px rgba(38,143,250,0.3)" }}
        >
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
                    <span className="px-2 py-1 rounded-md text-[9px] font-bold uppercase" style={{ backgroundColor: "rgba(34,197,94,0.1)", color: "#16a34a" }}>
                      editado
                    </span>
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
