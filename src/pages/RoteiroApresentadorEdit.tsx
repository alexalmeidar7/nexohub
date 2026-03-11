import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lock, Check, History, GripVertical, Save } from "lucide-react";
import { toast } from "sonner";

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

    // Load history
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
      .eq("apresentador_editado", true)
      .order("editado_at", { ascending: false })
      .limit(10);
    setHistorico(data || []);
  };

  const handleSave = async () => {
    if (!roteiro || !editorRef.current) return;
    setSaving(true);
    const { error } = await supabase
      .from("roteiros")
      .update({
        conteudo_html: editorRef.current.innerHTML,
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
            <input
              value={loginUser}
              onChange={e => setLoginUser(e.target.value)}
              placeholder="seu nome"
              className="w-full px-4 py-2.5 rounded-xl text-xs outline-none"
              style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.1)", color: "#0d0446" }}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
            <input
              type="password"
              value={loginPass}
              onChange={e => setLoginPass(e.target.value)}
              placeholder="senha"
              className="w-full px-4 py-2.5 rounded-xl text-xs outline-none"
              style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.1)", color: "#0d0446" }}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
            <button
              onClick={handleLogin}
              disabled={loading || !loginUser.trim() || !loginPass.trim()}
              className="w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)" }}
            >
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

  let participantesList: any[] = [];
  try {
    participantesList = typeof roteiro.participantes === "string" ? JSON.parse(roteiro.participantes) : roteiro.participantes || [];
  } catch { participantesList = []; }

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
        {(roteiro.subtitulo) && (
          <div className="mb-4 px-4 py-3 rounded-xl" style={{ backgroundColor: "rgba(38,143,250,0.06)", borderLeft: "3px solid #268ffa" }}>
            <p className="text-xs font-bold uppercase" style={{ color: "#268ffa" }}>Assunto da entrevista</p>
            <p className="text-sm font-bold mt-0.5" style={{ color: "#0d0446" }}>{roteiro.subtitulo}</p>
          </div>
        )}

        {/* Participantes */}
        {participantesList.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold uppercase mb-2" style={{ color: "rgba(13,4,70,0.5)" }}>Participantes</p>
            <div className="flex flex-wrap gap-2">
              {participantesList.map((p: any, i: number) => (
                <span key={i} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: "rgba(13,4,70,0.05)", color: "#0d0446" }}>
                  {p.nome}{p.cargo ? ` · ${p.cargo}` : p.categoria ? ` · ${p.categoria}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Editable content */}
        <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.08)" }}>
          <p className="text-xs font-bold uppercase mb-3" style={{ color: "#0d0446" }}>Roteiro do programa</p>
          <p className="text-[10px] mb-3" style={{ color: "rgba(13,4,70,0.4)" }}>Edite os textos e reordene as perguntas diretamente abaixo.</p>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="w-full min-h-[300px] text-sm outline-none"
            style={{ color: "#0d0446", lineHeight: "1.7" }}
          />
        </div>

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

        {/* Saved message */}
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
              <p className="text-xs font-bold" style={{ color: "#0d0446" }}>Roteiros editados</p>
            </div>
            <div className="space-y-2">
              {historico.map(r => (
                <div key={r.id} className="px-3 py-2.5 rounded-lg" style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid rgba(13,4,70,0.06)" }}>
                  <p className="text-xs font-semibold" style={{ color: "#0d0446" }}>{r.programa_nome || "Roteiro"}</p>
                  <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.45)" }}>
                    {r.editado_at ? format(new Date(r.editado_at), "dd/MM/yyyy 'às' HH:mm") : ""}
                    {r.titulo ? ` · ${r.titulo}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
