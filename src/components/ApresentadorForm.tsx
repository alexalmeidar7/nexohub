import { useState, useEffect } from "react";
import { Instagram, UserCheck, UserX, Trash2, Pencil, X } from "lucide-react";
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

const CARGO_OPTIONS = ["Apresentador", "Jornalista", "Convidado"];

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
  const [cargo, setCargo] = useState("");
  const [instagram, setInstagram] = useState("");
  const [foto, setFoto] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const [filterCargo, setFilterCargo] = useState("todos");
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    const list = await getApresentadores();
    list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    setApresentadores(list);
  };

  useEffect(() => { load(); }, []);

  const showFoto = cargo === "Apresentador" || cargo === "Jornalista";

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setNome(""); setCargo(""); setInstagram(""); setFoto(""); setAtivo(true); setEditingId(null);
  };

  const handleSave = async () => {
    if (!nome.trim() || !user || !cargo) return;

    if (editingId) {
      await supabase.from("apresentadores").update({
        nome: nome.trim(),
        cargo: cargo.trim(),
        instagram: instagram.trim(),
        foto: showFoto ? foto : "",
        ativo,
      }).eq("id", editingId);
    } else {
      await supabase.from("apresentadores").insert({
        user_id: user.id,
        nome: nome.trim(),
        cargo: cargo.trim(),
        instagram: instagram.trim(),
        foto: showFoto ? foto : "",
        ativo,
      });
    }
    await load();
    resetForm();
  };

  const startEdit = (a: Apresentador) => {
    setEditingId(a.id);
    setNome(a.nome);
    setCargo(a.cargo);
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

  const filtered = filterCargo === "todos"
    ? apresentadores
    : apresentadores.filter(a => a.cargo === filterCargo);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="max-w-md space-y-4">
        <h3 className="text-xl mb-4 text-primary">
          {editingId ? "Editar Apresentador/Participante" : "Novo Apresentador/Participante"}
        </h3>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome Completo"
          className="w-full bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />

        <div>
          <label className="block text-muted-foreground text-xs mb-1">Cargo</label>
          <Select value={cargo} onValueChange={setCargo}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione o cargo" />
            </SelectTrigger>
            <SelectContent>
              {CARGO_OPTIONS.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Instagram size={18} className="text-muted-foreground" />
          <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario_instagram"
            className="flex-1 bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
        </div>

        {showFoto && (
          <div>
            <label className="block text-muted-foreground text-xs mb-2">
              Foto (tamanho 1080 x 1080 px - PNG com fundo alpha)
            </label>
            <input type="file" accept="image/*" onChange={handleFoto}
              className="w-full bg-muted border border-border p-2 rounded-lg text-foreground text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:text-primary-foreground file:px-3 file:py-1 file:font-bold file:text-xs" />
            {foto && <img src={foto} alt="Preview" className="mt-2 h-24 rounded-lg object-cover border border-border" />}
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer text-foreground">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="w-4 h-4 accent-primary" />
          Ativo
        </label>
        <div className="flex gap-2">
          <button onClick={handleSave} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-bold hover:brightness-95 transition-all">
            {editingId ? "Atualizar" : "Salvar"}
          </button>
          {editingId && (
            <button onClick={resetForm} className="bg-muted border border-border text-foreground px-4 py-2 rounded-lg font-bold hover:brightness-95 transition-all flex items-center gap-1">
              <X size={14} /> Cancelar
            </button>
          )}
        </div>
      </div>

      {apresentadores.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium text-foreground">Cadastrados</h4>
            <Select value={filterCargo} onValueChange={setFilterCargo}>
              <SelectTrigger className="w-[180px] h-8 text-sm">
                <SelectValue placeholder="Filtrar por cargo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {CARGO_OPTIONS.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((a) => (
              <div key={a.id} className="bg-muted rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 font-bold text-sm bg-primary text-primary-foreground flex items-center justify-between">
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
                  {a.foto && <img src={a.foto} alt={a.nome} className="w-16 h-20 object-cover rounded-lg border border-border" />}
                  <div className="space-y-1 text-sm">
                    <p className="text-foreground">{a.cargo || "Sem cargo"}</p>
                    {a.instagram && (
                      <p className="text-muted-foreground flex items-center gap-1">
                        <Instagram size={12} /> {a.instagram}
                      </p>
                    )}
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      a.ativo ? "bg-primary/20 text-primary" : "bg-destructive/20 text-destructive"
                    }`}>
                      {a.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
