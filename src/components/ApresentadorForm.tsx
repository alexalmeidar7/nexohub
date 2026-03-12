import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Instagram, UserCheck, UserX, Trash2, Pencil, X, Loader2, CheckCircle, UserPlus, Camera, Shield, Phone } from "lucide-react";
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
  whatsapp: string;
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

  const stats = {
    total: apresentadores.length,
    ativos: apresentadores.filter(a => a.ativo).length,
    inativos: apresentadores.filter(a => !a.ativo).length,
  };

  const listSkeleton = (
    <div className="space-y-3 mt-6">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 w-28 rounded bg-[#0d0446]/15" />
        <Skeleton className="h-7 w-[160px] rounded-full bg-[#0d0446]/10" />
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.1)" }}>
        <div className="h-9 w-full" style={{ backgroundColor: "#0d0446" }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3" style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8f8fc" }}>
            <Skeleton className="h-3.5 w-20 rounded bg-[#0d0446]/10" />
            <Skeleton className="h-3.5 w-32 rounded bg-[#0d0446]/10" />
            <Skeleton className="h-3.5 w-24 rounded bg-[#0d0446]/10" />
            <Skeleton className="h-4 w-4 rounded-full bg-[#0d0446]/10 ml-auto" />
            <Skeleton className="h-5 w-14 rounded-full bg-[#0d0446]/10" />
            <Skeleton className="h-4 w-4 rounded bg-[#0d0446]/10" />
            <Skeleton className="h-5 w-10 rounded-full bg-[#0d0446]/10" />
            <Skeleton className="h-4 w-4 rounded bg-[#0d0446]/10" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in space-y-6">
      {/* Form Card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#d9e9fa", boxShadow: "0 8px 32px rgba(13,4,70,0.15)" }}>
        {/* Form Header */}
        <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid rgba(13,4,70,0.08)" }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(38,143,250,0.15)" }}>
            <UserPlus size={20} style={{ color: "#268ffa" }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: "#0d0446" }}>
              {editingId ? "Editar Apresentador/Participante" : "Novo Apresentador/Participante"}
            </h3>
            <p className="text-[11px]" style={{ color: "rgba(13,4,70,0.5)" }}>Preencha os dados abaixo para cadastrar</p>
          </div>
        </div>

        {/* Form Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Categoria */}
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "#0d0446" }}>Categoria</label>
              <Select value={categoria} onValueChange={setCategoria} open={catOpen} onOpenChange={setCatOpen}>
                <SelectTrigger className="w-full h-9" style={{ backgroundColor: "rgba(255,255,255,0.6)", color: "#0d0446", borderRadius: "12px", border: catOpen ? "1px solid #268ffa" : "1px solid rgba(13,4,70,0.15)", transition: "border-color 0.3s" }}>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIA_OPTIONS.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Nome */}
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "#0d0446" }}>Nome Completo</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Digite o nome completo"
                className="w-full px-4 py-2 outline-none transition-all text-sm placeholder:text-[#0d0446]/40"
                style={{ backgroundColor: "rgba(255,255,255,0.6)", border: "1px solid rgba(13,4,70,0.15)", borderRadius: "12px", color: "#0d0446" }}
                onFocus={e => { e.currentTarget.style.borderColor = "#268ffa"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.8)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "rgba(13,4,70,0.15)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.6)"; }}
              />
            </div>
          </div>

          {categoria === "Convidado" && (
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "#0d0446" }}>Cargo</label>
              <input value={cargoConvidado} onChange={(e) => setCargoConvidado(e.target.value)} placeholder="Ex: Médico, Advogado..."
                className="w-full px-4 py-2 outline-none transition-all text-sm placeholder:text-[#0d0446]/40"
                style={{ backgroundColor: "rgba(255,255,255,0.6)", border: "1px solid rgba(13,4,70,0.15)", borderRadius: "12px", color: "#0d0446" }}
                onFocus={e => { e.currentTarget.style.borderColor = "#268ffa"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.8)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "rgba(13,4,70,0.15)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.6)"; }}
              />
            </div>
          )}

          {/* Instagram */}
          <div>
            <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "#0d0446" }}>Instagram</label>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)" }}>
                <Instagram size={16} className="text-white" />
              </div>
              <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario_instagram"
                className="flex-1 px-4 py-2 outline-none transition-all text-sm placeholder:text-[#0d0446]/40"
                style={{ backgroundColor: "rgba(255,255,255,0.6)", border: "1px solid rgba(13,4,70,0.15)", borderRadius: "12px", color: "#0d0446" }}
                onFocus={e => { e.currentTarget.style.borderColor = "#268ffa"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.8)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "rgba(13,4,70,0.15)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.6)"; }}
              />
            </div>
          </div>

          {/* Foto */}
          {showFoto && (
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "#0d0446" }}>
                Foto (1080 × 1080 px — PNG com fundo transparente)
              </label>
              <div className="flex items-start gap-4">
                <label className="cursor-pointer group">
                  <div className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all group-hover:border-[#268ffa]"
                    style={{ backgroundColor: "rgba(255,255,255,0.5)", border: "2px dashed rgba(13,4,70,0.2)" }}>
                    {foto ? (
                      <img src={foto} alt="Preview" className="w-full h-full object-cover rounded-2xl" />
                    ) : (
                      <>
                        <Camera size={20} style={{ color: "rgba(13,4,70,0.3)" }} className="group-hover:text-[#268ffa] transition-colors" />
                        <span className="text-[9px] group-hover:text-[#268ffa]" style={{ color: "rgba(13,4,70,0.4)" }}>Upload</span>
                      </>
                    )}
                  </div>
                  <input type="file" accept="image/*" onChange={handleFoto} className="hidden" />
                </label>
                {foto && (
                  <button onClick={() => setFoto("")} className="text-[10px] text-red-400 hover:text-red-300 mt-2 transition-colors">
                    Remover foto
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Status + Actions */}
          <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid rgba(13,4,70,0.08)" }}>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div className="relative">
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 rounded-full transition-colors peer-checked:bg-[#268ffa]" style={{ backgroundColor: "rgba(13,4,70,0.15)" }} />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-sm" />
              </div>
              <span className="text-xs font-medium" style={{ color: "#0d0446" }}>{ativo ? "Ativo" : "Inativo"}</span>
            </label>

            <div className="flex gap-2">
              {editingId && (
                <button onClick={resetForm}
                  className="px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5 rounded-xl"
                  style={{ backgroundColor: "rgba(13,4,70,0.08)", color: "#0d0446", border: "1px solid rgba(13,4,70,0.15)" }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(13,4,70,0.15)"; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = "rgba(13,4,70,0.08)"; }}
                >
                  <X size={13} /> Cancelar
                </button>
              )}
              <button onClick={handleSave} disabled={saving}
                className="px-6 py-2 text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50 rounded-xl"
                style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff", boxShadow: "0 4px 15px rgba(38,143,250,0.3)" }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 20px rgba(38,143,250,0.5)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 4px 15px rgba(38,143,250,0.3)"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {saving ? "Salvando..." : editingId ? "Atualizar" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      {!loadingList && apresentadores.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ backgroundColor: "rgba(13,4,70,0.06)" }}>
            <Shield size={13} style={{ color: "#0d0446" }} />
            <span className="text-[11px] font-semibold" style={{ color: "#0d0446" }}>{stats.total} cadastrados</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ backgroundColor: "rgba(34,197,94,0.08)" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-[11px] font-medium text-green-700">{stats.ativos} ativos</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ backgroundColor: "rgba(220,38,38,0.06)" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="text-[11px] font-medium text-red-600">{stats.inativos} inativos</span>
          </div>
        </div>
      )}

      {/* Table */}
      {loadingList ? listSkeleton : apresentadores.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold" style={{ color: "#0d0446" }}>Cadastrados</h4>
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger className="w-[160px]" style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "12px", border: "none", fontSize: "12px", height: "30px", padding: "0 12px" }}>
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

          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.08)", boxShadow: "0 2px 12px rgba(13,4,70,0.06)" }}>
            <table className="w-full text-xs" style={{ color: "#0d0446" }}>
              <thead>
                <tr style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)", color: "#ffffff" }}>
                  <th className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider">Categoria</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider">Nome</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider">Rede Social</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-[11px] uppercase tracking-wider">Foto</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-[11px] uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-[11px] uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => (
                  <tr key={a.id} className="group transition-colors hover:bg-[#f0f4ff]" style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#fafaff", borderTop: "1px solid rgba(13,4,70,0.05)" }} data-no-row-hover>
                    <td className="px-4 py-2.5">
                      <span className="inline-block px-2 py-0.5 rounded-lg text-[10px] font-semibold"
                        style={{
                          backgroundColor: a.cargo === "Apresentador" ? "rgba(38,143,250,0.1)" : a.cargo === "Jornalista" ? "rgba(45,191,244,0.1)" : "rgba(251,216,55,0.15)",
                          color: a.cargo === "Apresentador" ? "#268ffa" : a.cargo === "Jornalista" ? "#0e9bc0" : "#b8860b",
                        }}
                      >
                        {a.cargo || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-semibold">{a.nome}</td>
                    <td className="px-4 py-2.5">
                      {a.instagram ? (
                        <span className="flex items-center gap-1.5 text-[11px]"><Instagram size={12} style={{ color: "#e1306c" }} /> {a.instagram}</span>
                      ) : <span className="text-[#0d0446]/25">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {a.foto ? <CheckCircle size={15} className="inline" style={{ color: "#22c55e" }} /> : <span className="text-[#0d0446]/20">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
                        a.ativo ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${a.ativo ? "bg-green-500" : "bg-red-500"}`} />
                        {a.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => startEdit(a)} title="Editar"
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-[#268ffa]/10">
                          <Pencil size={13} style={{ color: "#268ffa" }} />
                        </button>
                        <button onClick={() => toggleAtivo(a.id, a.ativo)} title={a.ativo ? "Desativar" : "Ativar"}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-green-50">
                          {a.ativo ? <UserCheck size={13} style={{ color: "#22c55e" }} /> : <UserX size={13} style={{ color: "#dc2626" }} />}
                        </button>
                        <button onClick={() => removeApresentador(a.id)} title="Remover"
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-50">
                          <Trash2 size={13} style={{ color: "#dc2626" }} />
                        </button>
                      </div>
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
            style={{ width: "450px", height: "165px", background: "linear-gradient(135deg, #0d0446, #1a0a6e)", borderRadius: "20px", boxShadow: "0 20px 60px rgba(13,4,70,0.4)" }}>
            <div className="flex items-center gap-3 flex-1 justify-center" style={{ fontSize: "14px", color: "#ffffff", fontWeight: 600 }}>
              <CheckCircle size={22} style={{ color: "#2dbef3" }} /> Salvo com sucesso!
            </div>
            <div className="w-full" style={{ height: "4px", backgroundColor: "rgba(255,255,255,0.1)" }}>
              <div style={{ height: "100%", background: "linear-gradient(90deg, #268ffa, #2dbef3)", animation: "shrinkBar 2s linear forwards" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
