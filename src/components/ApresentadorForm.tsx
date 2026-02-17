import { useState, useEffect } from "react";
import { Instagram, UserCheck, UserX, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Apresentador {
  id: string;
  nome: string;
  cargo: string;
  instagram: string;
  foto: string;
  ativo: boolean;
}

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

  const load = async () => {
    const list = await getApresentadores();
    setApresentadores(list);
  };

  useEffect(() => { load(); }, []);

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!nome.trim() || !user) return;
    await supabase.from("apresentadores").insert({
      user_id: user.id,
      nome: nome.trim(),
      cargo: cargo.trim(),
      instagram: instagram.trim(),
      foto,
      ativo,
    });
    await load();
    setNome(""); setCargo(""); setInstagram(""); setFoto(""); setAtivo(true);
  };

  const toggleAtivo = async (id: string, current: boolean) => {
    await supabase.from("apresentadores").update({ ativo: !current }).eq("id", id);
    await load();
  };

  const removeApresentador = async (id: string) => {
    await supabase.from("apresentadores").delete().eq("id", id);
    await load();
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="max-w-md space-y-4">
        <h3 className="text-xl mb-4 text-primary">Novo Apresentador</h3>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome Completo"
          className="w-full bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
        <input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Cargo/Especialidade"
          className="w-full bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
        <div className="flex items-center gap-2">
          <Instagram size={18} className="text-muted-foreground" />
          <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario_instagram"
            className="flex-1 bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div>
          <label className="block text-muted-foreground text-xs mb-2">
            Foto do apresentador (tamanho da foto 450 x 650 - PNG fundo alpha)
          </label>
          <input type="file" accept="image/*" onChange={handleFoto}
            className="w-full bg-muted border border-border p-2 rounded-lg text-foreground text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:text-primary-foreground file:px-3 file:py-1 file:font-bold file:text-xs" />
          {foto && <img src={foto} alt="Preview" className="mt-2 h-24 rounded-lg object-cover border border-border" />}
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-foreground">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="w-4 h-4 accent-primary" />
          Apresentador Ativo
        </label>
        <button onClick={handleSave} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-bold hover:brightness-95 transition-all">
          Salvar
        </button>
      </div>

      {apresentadores.length > 0 && (
        <div>
          <h4 className="text-lg font-medium text-foreground mb-4">Apresentadores Cadastrados</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {apresentadores.map((a) => (
              <div key={a.id} className="bg-muted rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 font-bold text-sm bg-primary text-primary-foreground flex items-center justify-between">
                  <span>{a.nome}</span>
                  <div className="flex items-center gap-2">
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
