import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Upload, ImageIcon, Pencil, X, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { compressImage } from "@/lib/imageCompressor";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

interface Testemunhal {
  id: string;
  programa_id: string | null;
  imagem_url: string;
  texto: string;
  data_inicio: string;
  data_fim: string;
  created_at: string;
  programa?: { nome: string };
}

interface Programa {
  id: string;
  nome: string;
}

const inputStyle: React.CSSProperties = {
  backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px",
};

export default function TestemunhaisPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Testemunhal[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [texto, setTexto] = useState("");
  const [programaId, setProgramaId] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    const [, { data: tData }, { data: pData }] = await Promise.all([
      supabase.rpc("cleanup_comercial"),
      supabase.from("testemunhais").select("*").eq("user_id", user.id).order("data_fim"),
      supabase.from("programas").select("id, nome").eq("user_id", user.id).eq("ativo", true),
    ]);

    const testemunhais = tData || [];
    const progs = pData || [];
    setProgramas(progs);

    setItems(
      testemunhais.map((t: any) => ({
        ...t,
        programa: progs.find((p: any) => p.id === t.programa_id),
      }))
    );
    setLoading(false);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const uploadImage = async (file: File): Promise<string> => {
    const compressed = await compressImage(file);
    const ext = compressed.name.split(".").pop();
    const path = `testemunhais/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("comercial").upload(path, compressed, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("comercial").getPublicUrl(path);
    return data.publicUrl;
  };

  const startEdit = (item: Testemunhal) => {
    setEditingId(item.id);
    setTexto(item.texto);
    setProgramaId(item.programa_id || "");
    setDataInicio(item.data_inicio);
    setDataFim(item.data_fim);
    setImagePreview(item.imagem_url || "");
    setImageFile(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !texto || !dataInicio || !dataFim) return;
    setSaving(true);

    try {
      let imagem_url = editingId ? imagePreview : "";
      if (imageFile) imagem_url = await uploadImage(imageFile);

      if (editingId) {
        const { error } = await supabase.from("testemunhais").update({
          programa_id: programaId || null,
          imagem_url,
          texto,
          data_inicio: dataInicio,
          data_fim: dataFim,
        }).eq("id", editingId);
        if (error) throw error;
        toast({ title: "Testemunhal atualizado!" });
      } else {
        const { error } = await supabase.from("testemunhais").insert({
          user_id: user.id,
          programa_id: programaId || null,
          imagem_url,
          texto,
          data_inicio: dataInicio,
          data_fim: dataFim,
        });
        if (error) throw error;
        toast({ title: "Testemunhal salvo com sucesso!" });
      }

      setEditingId(null);
      resetForm();
      await loadData();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setTexto("");
    setProgramaId("");
    setDataInicio("");
    setDataFim("");
    setImageFile(null);
    setImagePreview("");
  };

  const handleDelete = async (id: string) => {
    await supabase.from("testemunhais").delete().eq("id", id);
    await loadData();
  };

  const diasRestantes = (dataFim: string) => {
    return Math.ceil((new Date(dataFim + "T23:59:59").getTime() - Date.now()) / 86400000);
  };

  if (loading) {
    return <ModulePageSkeleton />;
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <form onSubmit={handleSubmit} className="rounded-xl p-6 space-y-4" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.1)" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: "#0d0446" }}>
            {editingId ? "Editar Testemunhal" : "Novo Testemunhal"}
          </h3>
          {editingId && (
            <button type="button" onClick={cancelEdit}
              className="flex items-center gap-1 px-3 py-1 text-xs font-bold transition-all"
              style={{ backgroundColor: "#ffffff", color: "#0d0446", border: "2px solid #0d0446", borderRadius: "20px" }}
            >
              <X size={12} /> Cancelar edição
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: "#0d0446", fontWeight: 600 }}>Foto do Cliente</label>
              <div className="flex items-center gap-3">
                {imagePreview ? (
                  <img src={imagePreview} alt="preview" className="w-16 h-16 rounded-lg object-cover" style={{ border: "1px solid rgba(13,4,70,0.1)" }} />
                ) : (
                  <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.1)" }}>
                    <ImageIcon size={20} style={{ color: "rgba(13,4,70,0.3)" }} />
                  </div>
                )}
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold transition-all"
                  style={{ backgroundColor: "#ffffff", color: "#0d0446", border: "2px solid #0d0446", borderRadius: "20px" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#0d0446"; (e.currentTarget as HTMLElement).style.color = "#ffffff"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#ffffff"; (e.currentTarget as HTMLElement).style.color = "#0d0446"; }}
                >
                  <Upload size={12} /> Enviar imagem
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: "#0d0446", fontWeight: 600 }}>Texto do Testemunhal</label>
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Relato do cliente..." rows={4} required
                className="w-full px-4 py-2 text-sm outline-none transition-colors min-h-[80px]"
                style={{ ...inputStyle, borderRadius: "12px" }}
                onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: "#0d0446", fontWeight: 600 }}>Vínculo com Programa</label>
              <select value={programaId} onChange={(e) => setProgramaId(e.target.value)}
                className="w-full px-4 py-1.5 text-sm outline-none appearance-none"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
              >
                <option value="">Selecione um programa</option>
                {programas.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: "#0d0446", fontWeight: 600 }}>Início</label>
                <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} required
                  className="w-full px-4 py-1.5 text-sm outline-none"
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "#0d0446", fontWeight: 600 }}>Fim</label>
                <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} required
                  className="w-full px-4 py-1.5 text-sm outline-none"
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
                />
              </div>
            </div>

            <button type="submit" disabled={saving}
              className="w-full px-6 py-2 font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: "#0d0446", color: "#ffffff", border: "2px solid #0d0446", borderRadius: "20px" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "#0d0446"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
            >
              {saving ? <><Loader2 className="animate-spin" size={14} /> Salvando...</> : editingId ? "Atualizar Testemunhal" : "Cadastrar Testemunhal"}
            </button>
          </div>
        </div>
      </form>

      <div>
        <h3 className="text-lg font-bold mb-3" style={{ color: "#0d0446" }}>Testemunhais Ativos</h3>
        {items.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(13,4,70,0.5)" }}>Nenhum testemunhal cadastrado.</p>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.1)" }}>
            <table className="w-full text-sm" style={{ color: "#0d0446" }}>
              <thead>
                <tr style={{ backgroundColor: "#0d0446", color: "#ffffff" }}>
                  <th className="px-4 py-2 text-left font-semibold">Imagem</th>
                  <th className="px-4 py-2 text-left font-semibold">Texto</th>
                  <th className="px-4 py-2 text-left font-semibold">Programa</th>
                  <th className="px-4 py-2 text-center font-semibold">Validade</th>
                  <th className="px-4 py-2 text-center font-semibold">Editar</th>
                  <th className="px-4 py-2 text-center font-semibold">Excluir</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const dias = diasRestantes(item.data_fim);
                  return (
                    <tr key={item.id} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8f8fc", borderTop: "1px solid rgba(13,4,70,0.08)" }}>
                      <td className="px-4 py-2">
                        {item.imagem_url ? (
                          <img src={item.imagem_url} alt="" className="w-10 h-10 rounded-lg object-cover" style={{ border: "1px solid rgba(13,4,70,0.08)" }} />
                        ) : (
                          <span style={{ color: "rgba(13,4,70,0.25)" }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 max-w-[200px]">
                        <p className="truncate text-xs">{item.texto}</p>
                      </td>
                      <td className="px-4 py-2 text-xs">{item.programa?.nome || "Sem programa"}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${dias <= 3 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}>
                          {dias}d restante{dias !== 1 ? "s" : ""}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => startEdit(item)} title="Editar" className="hover:opacity-70 transition-opacity">
                          <Pencil size={14} style={{ color: "#0d0446" }} />
                        </button>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => handleDelete(item.id)} title="Remover" className="hover:opacity-70 transition-opacity">
                          <Trash2 size={14} style={{ color: "#dc2626" }} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
