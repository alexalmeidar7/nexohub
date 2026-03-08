import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Instagram, UserCheck, UserX, Trash2, Pencil, X, Loader2, CheckCircle } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
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
  const [showSuccess, setShowSuccess] = useState(false);
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
  const [catOpen, setCatOpen] = useState(false);

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
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
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

  if (loadingList) {
    return (
      <div className="animate-fade-in space-y-6">
        {/* Form skeleton */}
        <div className="max-w-md space-y-4">
          <Skeleton className="h-6 w-64 rounded bg-[#0d0446]/20" />
          <Skeleton className="h-8 w-full rounded-full bg-[#0d0446]/10" />
          <Skeleton className="h-8 w-full rounded-full bg-[#0d0446]/10" />
          <Skeleton className="h-8 w-full rounded-full bg-[#0d0446]/10" />
          <Skeleton className="h-8 w-32 rounded-full bg-[#0d0446]/15" />
        </div>
        {/* Table skeleton */}
        <ModulePageSkeleton />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="max-w-md space-y-4">
        <h3 className="text-xl mb-4" style={{ color: "#0d0446" }}>
          {editingId ? "Editar Apresentador/Participante" : "Novo Apresentador/Participante"}
        </h3>
        <div>
          <label className="block text-xs mb-1" style={{ color: "#0d0446", fontWeight: 600 }}>Categoria</label>
          <Select value={categoria} onValueChange={setCategoria} open={catOpen} onOpenChange={setCatOpen}>
            <SelectTrigger className="w-full h-8" style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: catOpen ? "2px solid #2dbef3" : "2px solid #0d0446", transition: "border-color 0.3s" }}>
              <SelectValue placeholder="Selecione a categoria" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIA_OPTIONS.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome Completo"
          className="w-full px-4 py-1.5 outline-none transition-colors text-sm"
          style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}
          onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
        />

        {categoria === "Convidado" && (
          <input value={cargoConvidado} onChange={(e) => setCargoConvidado(e.target.value)} placeholder="Cargo (ex: Médico, Advogado...)"
            className="w-full px-4 py-1.5 outline-none transition-colors text-sm"
            style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}
            onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
          />
        )}

        <div className="flex items-center gap-2">
          <Instagram size={18} style={{ color: "#0d0446" }} />
          <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario_instagram"
            className="flex-1 px-4 py-1.5 outline-none transition-colors text-sm"
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

      {apresentadores.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium" style={{ color: "#0d0446" }}>Cadastrados</h4>
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger className="w-[160px]" style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "none", fontSize: "14px", height: "28px", padding: "0 12px" }}>
                <SelectValue placeholder="Filtrar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {CATEGORIA_OPTIONS.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.1)" }}>
            <table className="w-full text-sm" style={{ color: "#0d0446" }}>
              <thead>
                <tr style={{ backgroundColor: "#0d0446", color: "#ffffff" }}>
                  <th className="px-4 py-2 text-left font-semibold">Categoria</th>
                  <th className="px-4 py-2 text-left font-semibold">Nome</th>
                  <th className="px-4 py-2 text-left font-semibold">Rede Social</th>
                  <th className="px-4 py-2 text-center font-semibold">Imagem</th>
                  <th className="px-4 py-2 text-center font-semibold">Status</th>
                  <th className="px-4 py-2 text-center font-semibold">Editar</th>
                  <th className="px-4 py-2 text-center font-semibold">Ativo/Inativo</th>
                  <th className="px-4 py-2 text-center font-semibold">Excluir</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => (
                  <tr key={a.id} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8f8fc", borderTop: "1px solid rgba(13,4,70,0.08)" }}>
                    <td className="px-4 py-2">{a.cargo || "—"}</td>
                    <td className="px-4 py-2 font-medium">{a.nome}</td>
                    <td className="px-4 py-2">
                      {a.instagram ? (
                        <span className="flex items-center gap-1"><Instagram size={12} /> {a.instagram}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {a.foto ? <CheckCircle size={16} className="inline" style={{ color: "#22c55e" }} /> : <span style={{ color: "rgba(13,4,70,0.25)" }}>—</span>}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        a.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                      }`}>
                        {a.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => startEdit(a)} title="Editar" className="hover:opacity-70 transition-opacity">
                        <Pencil size={14} style={{ color: "#0d0446" }} />
                      </button>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => toggleAtivo(a.id, a.ativo)} title={a.ativo ? "Desativar" : "Ativar"} className="hover:opacity-70 transition-opacity">
                        {a.ativo ? <UserCheck size={14} style={{ color: "#22c55e" }} /> : <UserX size={14} style={{ color: "#dc2626" }} />}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => removeApresentador(a.id)} title="Remover" className="hover:opacity-70 transition-opacity">
                        <Trash2 size={14} style={{ color: "#dc2626" }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
          <div className="flex flex-col items-center justify-center animate-fade-in overflow-hidden"
            style={{ width: "450px", height: "165px", backgroundColor: "rgba(13, 4, 70, 0.92)", borderRadius: "16px" }}>
            <div className="flex items-center gap-3 flex-1 justify-center" style={{ fontSize: "14px", color: "#ffffff", fontWeight: 600 }}>
              <CheckCircle size={22} /> Salvo com sucesso!
            </div>
            <div className="w-full" style={{ height: "4px", backgroundColor: "rgba(255,255,255,0.15)" }}>
              <div style={{ height: "100%", backgroundColor: "#2dbff4", animation: "shrinkBar 2s linear forwards" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
