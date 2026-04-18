import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Upload, ImageIcon, Pencil, X, CheckCircle, Bold, Italic, Underline, Palette, Droplets } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { compressImage } from "@/lib/imageCompressor";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

const TOOLBAR_COLORS = ["#000000", "#dc2626", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#ffffff"];

function RichTextToolbar({ editorRef, onInput }: { editorRef: React.RefObject<HTMLDivElement>; onInput: () => void }) {
  const [showColors, setShowColors] = useState(false);

  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    onInput();
  };

  const btnStyle: React.CSSProperties = {
    background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)",
    color: "var(--layout-page-text, #1a1a1a)",
    border: "none",
    borderRadius: "6px",
    width: 28,
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    position: "relative" as const,
  };

  return (
    <div style={{ display: "flex", gap: 4, padding: "6px 8px", borderBottom: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)", background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)", borderRadius: "12px 12px 0 0" }}>
      <button type="button" style={btnStyle} onClick={() => exec("bold")} title="Negrito"><Bold size={14} /></button>
      <button type="button" style={btnStyle} onClick={() => exec("italic")} title="Itálico"><Italic size={14} /></button>
      <button type="button" style={btnStyle} onClick={() => exec("underline")} title="Sublinhado"><Underline size={14} /></button>
      <div style={{ position: "relative" }}>
        <button type="button" style={btnStyle} onClick={() => setShowColors(!showColors)} title="Cor do texto"><Palette size={14} /></button>
        {showColors && (
          <div style={{ position: "absolute", top: 32, left: 0, zIndex: 20, background: "var(--layout-page-bg, #ffffff)", border: "1px solid var(--layout-border-color, #333333)", borderRadius: 8, padding: 6, display: "flex", gap: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
            {TOOLBAR_COLORS.map(c => (
              <button key={c} type="button" onClick={() => { exec("foreColor", c); setShowColors(false); }}
                style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: c === "#ffffff" ? "1px solid #ccc" : "1px solid transparent", cursor: "pointer" }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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
  backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid var(--layout-border-color, #333333)", color: "var(--layout-page-text, #1a1a1a)", borderRadius: "20px",
};

interface TestemunhaisPageProps {
  effectiveUserId?: string | null;
}

export default function TestemunhaisPage({ effectiveUserId }: TestemunhaisPageProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Testemunhal[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dataUserId, setDataUserId] = useState<string | null>(effectiveUserId ?? null);

  const editorRef = useRef<HTMLDivElement>(null);
  const [texto, setTexto] = useState("");
  const [programaId, setProgramaId] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");

  useEffect(() => {
    if (effectiveUserId) {
      setDataUserId(effectiveUserId);
      return;
    }

    if (!user) return;
    let cancelled = false;

    supabase
      .from("sub_users")
      .select("parent_user_id, ativo")
      .eq("auth_user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setDataUserId(data?.ativo && data.parent_user_id ? data.parent_user_id : user.id);
      });

    return () => {
      cancelled = true;
    };
  }, [user, effectiveUserId]);

  const loadData = async (targetUserId = dataUserId) => {
    if (!targetUserId) return;
    const [, { data: tData }, { data: pData }] = await Promise.all([
      supabase.rpc("cleanup_comercial"),
      supabase.from("testemunhais").select("*").eq("user_id", targetUserId).order("data_fim"),
      supabase.from("programas").select("id, nome").eq("user_id", targetUserId).eq("ativo", true),
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

  useEffect(() => {
    if (dataUserId) loadData(dataUserId);
  }, [dataUserId]);

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
    setTimeout(() => { if (editorRef.current) editorRef.current.innerHTML = item.texto; }, 0);
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
    if (!user || !dataUserId || !texto || !dataInicio || !dataFim) return;
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
        toast({ title: "Citação atualizada!" });
      } else {
        const { error } = await supabase.from("testemunhais").insert({
          user_id: dataUserId,
          programa_id: programaId || null,
          imagem_url,
          texto,
          data_inicio: dataInicio,
          data_fim: dataFim,
        });
        if (error) throw error;
        toast({ title: "Citação salva com sucesso!" });
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
    if (editorRef.current) editorRef.current.innerHTML = "";
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

  if (loading || !dataUserId) {
    return (
      <div>
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-transparent overflow-hidden">
          <div className="h-full animate-pulse rounded-r" style={{ width: "60%", background: "var(--layout-accent-color, #e53e3e)", animation: "loadbar 1.2s ease-in-out infinite" }} />
        </div>
        <style>{`@keyframes loadbar { 0% { width: 10%; margin-left: 0; } 50% { width: 60%; margin-left: 20%; } 100% { width: 10%; margin-left: 90%; } }`}</style>
        <ModulePageSkeleton variant="form" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="rounded-2xl" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 12%, var(--layout-page-bg, #ffffff) 88%)", boxShadow: "0 8px 32px rgba(0,0,0,0.10)", padding: "20px" }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
            <ImageIcon size={20} style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Citações</h3>
            <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Gerencie depoimentos de clientes vinculados a programas</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
            <h3 className="text-sm font-bold" style={{ color: "var(--layout-header-text, #ffffff)" }}>
              {editingId ? "✏️ Editar Citação" : "➕ Nova Citação"}
            </h3>
            {editingId && (
              <button type="button" onClick={cancelEdit}
                className="flex items-center gap-1 px-3 py-1 text-[10px] font-bold rounded-full transition-all"
                style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "var(--layout-header-text, #ffffff)", border: "1px solid rgba(255,255,255,0.3)" }}
              >
                <X size={10} /> Cancelar
              </button>
            )}
          </div>

          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Foto do Cliente</label>
                  <div className="flex items-center gap-3">
                    {imagePreview ? (
                      <img src={imagePreview} alt="preview" className="w-16 h-16 rounded-lg object-cover" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)" }} />
                    ) : (
                      <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)" }}>
                        <ImageIcon size={20} style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 30%, transparent)" }} />
                      </div>
                    )}
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold transition-all rounded-full"
                      style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", color: "var(--layout-page-text, #1a1a1a)", border: "2px solid #0d0446", borderRadius: "20px" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--layout-header-bg, #1a1a1a)"; (e.currentTarget as HTMLElement).style.color = "#ffffff"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#ffffff"; (e.currentTarget as HTMLElement).style.color = "var(--layout-header-bg, #1a1a1a)"; }}
                    >
                      <Upload size={12} /> Enviar imagem
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Texto da Citação</label>
                  <div style={{ ...inputStyle, borderRadius: "12px", overflow: "hidden" }}
                    onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "#be0101"; }}
                    onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                  >
                    <RichTextToolbar editorRef={editorRef} onInput={() => { if (editorRef.current) setTexto(editorRef.current.innerHTML); }} />
                    <div
                      ref={editorRef}
                      contentEditable
                      suppressContentEditableWarning
                      className="w-full px-4 py-2 text-sm outline-none min-h-[80px] max-h-[200px] overflow-y-auto"
                      style={{ color: "var(--layout-page-text, #1a1a1a)", background: "transparent" }}
                      onInput={() => { if (editorRef.current) setTexto(editorRef.current.innerHTML); }}
                      data-placeholder="Relato do cliente..."
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Vínculo com Programa</label>
                  <select value={programaId} onChange={(e) => setProgramaId(e.target.value)}
                    className="w-full px-4 py-1.5 text-sm outline-none appearance-none"
                    style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = "#be0101"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                  >
                    <option value="">Selecione um programa</option>
                    {programas.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Início</label>
                    <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} required
                      className="w-full px-4 py-1.5 text-sm outline-none"
                      style={inputStyle}
                      onFocus={e => { e.currentTarget.style.borderColor = "#be0101"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Fim</label>
                    <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} required
                      className="w-full px-4 py-1.5 text-sm outline-none"
                      style={inputStyle}
                      onFocus={e => { e.currentTarget.style.borderColor = "#be0101"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                    />
                  </div>
                </div>

                <button type="submit" disabled={saving}
                  className="btn-skyglass-accent w-full py-2.5 text-sm disabled:opacity-50"
                >
                  {saving ? <><Loader2 className="animate-spin" size={14} /> Salvando...</> : editingId ? "Atualizar Citação" : "Cadastrar Citação"}
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* List */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="px-4 py-2.5" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
            <h3 className="text-sm font-bold" style={{ color: "var(--layout-header-text, #ffffff)" }}>📋 Citações Cadastradas</h3>
          </div>

          {items.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Nenhuma citação cadastrada.</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="w-full text-sm" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  <thead>
                    <tr style={{ backgroundColor: "rgba(13,4,70,0.04)" }}>
                      <th className="px-4 py-2 text-left font-semibold text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Imagem</th>
                      <th className="px-4 py-2 text-left font-semibold text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Texto</th>
                      <th className="px-4 py-2 text-left font-semibold text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Programa</th>
                      <th className="px-4 py-2 text-center font-semibold text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Validade</th>
                      <th className="px-4 py-2 text-center font-semibold text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Editar</th>
                      <th className="px-4 py-2 text-center font-semibold text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Excluir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => {
                      const dias = diasRestantes(item.data_fim);
                      return (
                        <tr key={item.id} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8f8fc", borderTop: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)" }}>
                          <td className="px-4 py-2">
                            {item.imagem_url ? (
                              <img src={item.imagem_url} alt="" className="w-10 h-10 rounded-lg object-cover" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }} />
                            ) : (
                              <span style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 25%, transparent)" }}>—</span>
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
                              <Pencil size={14} style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
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

              {/* Mobile cards */}
              <div className="md:hidden p-3 space-y-3">
                {items.map((item) => {
                  const dias = diasRestantes(item.data_fim);
                  return (
                    <div key={item.id} className="rounded-xl p-3 space-y-2" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
                      <div className="flex items-start gap-3">
                        {item.imagem_url && (
                          <img src={item.imagem_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs line-clamp-2" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{item.texto}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>{item.programa?.nome || "Sem programa"}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${dias <= 3 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}>
                          {dias}d restante{dias !== 1 ? "s" : ""}
                        </span>
                        <div className="flex items-center gap-3">
                          <button onClick={() => startEdit(item)}><Pencil size={14} style={{ color: "var(--layout-page-text, #1a1a1a)" }} /></button>
                          <button onClick={() => handleDelete(item.id)}><Trash2 size={14} style={{ color: "#dc2626" }} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
