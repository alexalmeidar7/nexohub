import { useState, useEffect } from "react";
import { Instagram, UserCheck, UserX, Trash2, Pencil, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Apresentador {
  id: string;
  nome: string;
  cargo: string;
  instagram: string;
  foto: string;
  ativo: boolean;
}

const CATEGORIA_OPTIONS = ["Apresentador", "Jornalista", "Convidado"];

export async function getApresentadores(): Promise<Apresentador[]> {
  const { data } = await supabase.from("apresentadores").select("*");
  if (!data) return [];
  return data.map(a => ({
    id: a.id,
    nome: a.nome,
    cargo: a.cargo || "",
    instagram: a.instagram || "",
    foto: a.foto || "",
    ativo: a.ativo ?? true,
  }));
}

export default function ApresentadorForm() {
  const { user } = useAuth();
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [cargoConvidado, setCargoConvidado] = useState("");
  const [instagram, setInstagram] = useState("");
  const [foto, setFoto] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const [filterCategoria, setFilterCategoria] = useState("todos");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  const load = async () => {
    setLoadingList(true);
    const list = await getApresentadores();
    list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    setApresentadores(list);
    setLoadingList(false);
  };

  useEffect(() => { load(); }, []);

  const showFoto = categoria === "Apresentador" || categoria === "Jornalista";

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setNome(""); setCategoria(""); setCargoConvidado(""); setInstagram(""); setFoto(""); setAtivo(true); setEditingId(null);
  };

  const handleSave = async () => {
    if (!nome.trim() || !user || !categoria) return;
    setSaving(true);

    const cargoValue = categoria === "Convidado" ? categoria : categoria;

    if (editingId) {
      await supabase.from("apresentadores").update({
        nome: nome.trim(),
        cargo: cargoValue,
        instagram: instagram.trim(),
        foto: showFoto ? foto : "",
        ativo,
      }).eq("id", editingId);
    } else {
      await supabase.from("apresentadores").insert({
        user_id: user.id,
        nome: nome.trim(),
        cargo: cargoValue,
        instagram: instagram.trim(),
        foto: showFoto ? foto : "",
        ativo,
      });
    }
    await load();
    resetForm();
    setSaving(false);
  };

  const startEdit = (a: Apresentador) => {
    setEditingId(a.id);
    setNome(a.nome);
    setCategoria(a.cargo);
    setInstagram(a.instagram);
    setFoto(a.foto);
    setAtivo(a.ativo);
  };

  const toggleAtivo = async (id: string, current: boolean) => {
    await supabase.from("apresentadores").update({ ativo: !current }).eq("id", id);
    await load();
  };

  const removeApresentador = async (id: string) => {
    await supabase.from("apresentadores").delete().eq("id", id);
    await load();
  };

  const filtered = filterCategoria === "todos"
    ? apresentadores
    : apresentadores.filter(a => a.cargo === filterCategoria);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="max-w-md space-y-4">
        <h3 className="text-xl mb-4" style={{ color: "#0d0446" }}>
          {editingId ? "Editar Apresentador/Participante" : "Novo Apresentador/Participante"}
        </h3>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome Completo"
          className="w-full p-3 outline-none transition-colors"
          style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}
          onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
        />

        <div>
          <label className="block text-xs mb-1" style={{ color: "#0d0446", fontWeight: 600 }}>Categoria</label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="w-full" style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "none" }}>
              <SelectValue placeholder="Selecione a categoria" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIA_OPTIONS.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {categoria === "Convidado" && (
          <input value={cargoConvidado} onChange={(e) => setCargoConvidado(e.target.value)} placeholder="Cargo (ex: Médico, Advogado...)"
            className="w-full p-3 outline-none transition-colors"
            style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}
            onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
          />
        )}

        <div className="flex items-center gap-2">
          <Instagram size={18} style={{ color: "#0d0446" }} />
          <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario_instagram"
            className="flex-1 p-3 outline-none transition-colors"
            style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}
            onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
          />
        </div>

        {showFoto && (
          <div>
            <label className="block text-xs mb-2" style={{ color: "#0d0446", fontWeight: 600 }}>
              Foto (tamanho 1080 x 1080 px - PNG com fundo alpha)
            </label>
            <input type="file" accept="image/*" onChange={handleFoto}
              className="w-full p-2 text-sm file:mr-3 file:rounded-full file:border-0 file:px-3 file:py-1 file:font-bold file:text-xs"
              style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}
            />
            {foto && <img src={foto} alt="Preview" className="mt-2 h-24 rounded-lg object-cover" style={{ border: "1px solid #0d0446" }} />}
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer" style={{ color: "#0d0446" }}>
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="w-4 h-4" style={{ accentColor: "#0d0446" }} />
          Ativo
        </label>
        <div className="flex gap-2 items-center">
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2 font-bold transition-all flex items-center gap-2 disabled:opacity-70"
            style={{ backgroundColor: "#0d0446", color: "#ffffff", border: "2px solid #0d0446", borderRadius: "20px" }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "#0d0446"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Salvando..." : editingId ? "Atualizar" : "Salvar"}
          </button>
          {editingId && (
            <button onClick={resetForm}
              className="px-4 py-2 font-bold transition-all flex items-center gap-1"
              style={{ backgroundColor: "#ffffff", color: "#0d0446", border: "2px solid #0d0446", borderRadius: "20px" }}
            >
              <X size={14} /> Cancelar
            </button>
          )}
        </div>
      </div>

      {loadingList ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 size={20} className="animate-spin" style={{ color: "#0d0446" }} />
          <span className="text-sm" style={{ color: "rgba(13,4,70,0.5)" }}>Carregando cadastrados...</span>
        </div>
      ) : apresentadores.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium" style={{ color: "#0d0446" }}>Cadastrados</h4>
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger className="w-[180px] h-8 text-sm" style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "none" }}>
                <SelectValue placeholder="Filtrar por categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {CATEGORIA_OPTIONS.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((a) => (
              <div key={a.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.1)" }}>
                <div className="px-4 py-3 font-bold text-sm flex items-center justify-between" style={{ backgroundColor: "#0d0446", color: "#ffffff" }}>
                  <span>{a.nome}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(a)} title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => toggleAtivo(a.id, a.ativo)} title={a.ativo ? "Desativar" : "Ativar"}>
                      {a.ativo ? <UserCheck size={14} /> : <UserX size={14} />}
                    </button>
                    <button onClick={() => removeApresentador(a.id)} title="Remover">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="p-4 flex gap-3">
                  {a.foto && <img src={a.foto} alt={a.nome} className="w-16 h-20 object-cover rounded-lg" style={{ border: "1px solid #0d0446" }} />}
                  <div className="space-y-1 text-sm">
                    <p style={{ color: "#0d0446" }}>{a.cargo || "Sem categoria"}</p>
                    {a.instagram && (
                      <p className="flex items-center gap-1" style={{ color: "rgba(13,4,70,0.5)" }}>
                        <Instagram size={12} /> {a.instagram}
                      </p>
                    )}
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      a.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                    }`}>
                      {a.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
