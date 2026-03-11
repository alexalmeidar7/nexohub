import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Trash2, Power } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface TP {
  id: string;
  estudio: string;
  nome: string;
  ativo: boolean;
  created_at: string;
}

export default function TeleprompterPage() {
  const { user } = useAuth();
  const [tps, setTps] = useState<TP[]>([]);
  const [estudios, setEstudios] = useState<string[]>([]);
  const [estudio, setEstudio] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadTPs();
    loadEstudios();
  }, [user]);

  async function loadEstudios() {
    if (!user) return;
    const { data } = await supabase
      .from("programas")
      .select("estudio")
      .eq("user_id", user.id);
    if (data) {
      const unique = [...new Set(data.map((p) => p.estudio).filter(Boolean))] as string[];
      setEstudios(unique);
    }
  }

  async function loadTPs() {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("teleprompters")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setTps(data);
  }

  async function handleAdd() {
    if (!user || !estudio.trim() || !nome.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await (supabase as any)
      .from("teleprompters")
      .insert({ user_id: user.id, estudio: estudio.trim(), nome: nome.trim() });
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "TP cadastrado com sucesso!" });
      setNome("");
      setEstudio("");
      loadTPs();
    }
  }

  async function handleToggle(tp: TP) {
    await (supabase as any)
      .from("teleprompters")
      .update({ ativo: !tp.ativo })
      .eq("id", tp.id);
    loadTPs();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este TP?")) return;
    await (supabase as any).from("teleprompters").delete().eq("id", id);
    loadTPs();
  }

  const inputStyle = "w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2";

  return (
    <div className="space-y-6">
      {/* Form */}
      <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: "#f0f2f8", border: "1px solid #e2e8f0" }}>
        <h3 className="text-sm font-bold" style={{ color: "#0d0446" }}>Cadastrar TP</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#0d0446" }}>Estúdio</label>
            <select
              value={estudio}
              onChange={(e) => setEstudio(e.target.value)}
              className={inputStyle}
              style={{ borderColor: "#c7d2e0", color: "#0d0446", backgroundColor: "#ffffff" }}
            >
              <option value="">Selecione o estúdio</option>
              {estudios.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#0d0446" }}>Nome do TP</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: TP Principal"
              className={inputStyle}
              style={{ borderColor: "#c7d2e0", color: "#0d0446", backgroundColor: "#ffffff" }}
            />
          </div>
        </div>

        <button
          onClick={handleAdd}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all"
          style={{ backgroundColor: "#268ffa", color: "#ffffff" }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#0d0446"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#268ffa"; }}
        >
          <Plus size={14} /> {loading ? "Salvando..." : "Cadastrar TP"}
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0" }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ backgroundColor: "#0d0446", color: "#ffffff" }}>
              <th className="text-left px-4 py-2 font-semibold">Estúdio</th>
              <th className="text-left px-4 py-2 font-semibold">Nome do TP</th>
              <th className="text-center px-4 py-2 font-semibold">Status</th>
              <th className="text-center px-4 py-2 font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {tps.length === 0 && (
              <tr><td colSpan={4} className="text-center py-6 text-sm" style={{ color: "rgba(13,4,70,0.4)" }}>Nenhum TP cadastrado</td></tr>
            )}
            {tps.map((tp) => (
              <tr key={tp.id} className="border-t" style={{ borderColor: "#e2e8f0", backgroundColor: "#ffffff" }}>
                <td className="px-4 py-2" style={{ color: "#0d0446" }}>{tp.estudio}</td>
                <td className="px-4 py-2 font-medium" style={{ color: "#0d0446" }}>{tp.nome}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${tp.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-500"}`}>
                    {tp.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => handleToggle(tp)} title={tp.ativo ? "Desativar" : "Ativar"}>
                      <Power size={14} style={{ color: tp.ativo ? "#22c55e" : "#ef4444" }} />
                    </button>
                    <button onClick={() => handleDelete(tp.id)} title="Remover">
                      <Trash2 size={14} style={{ color: "#ef4444" }} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
