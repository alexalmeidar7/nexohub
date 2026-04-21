import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Upload, ImageIcon, Pencil, X, Bold, Underline, Palette } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { compressImage } from "@/lib/imageCompressor";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

const RICH_COLORS = ["#ff0000", "#ff8800", "#00aa00", "#0066ff", "#9900cc", "#000000", "#ffffff"];

function RichTextToolbar({ editorRef, onInput }: { editorRef: React.RefObject<HTMLDivElement>; onInput: () => void }) {
  const exec = (cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    onInput();
  };
  const [showColors, setShowColors] = useState(false);

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b" style={{ borderColor: "var(--layout-border-color, #333333)" }}>
      <button type="button" title="Negrito" onClick={() => exec("bold")}
        className="p-1.5 rounded-lg hover:opacity-70 transition-opacity" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
        <Bold size={14} />
      </button>
      <button type="button" title="Sublinhado" onClick={() => exec("underline")}
        className="p-1.5 rounded-lg hover:opacity-70 transition-opacity" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
        <Underline size={14} />
      </button>
      <div className="relative">
        <button type="button" title="Cor do texto" onClick={() => setShowColors(!showColors)}
          className="p-1.5 rounded-lg hover:opacity-70 transition-opacity" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
          <Palette size={14} />
        </button>
        {showColors && (
          <div className="absolute top-full left-0 mt-1 flex gap-1 p-1.5 rounded-lg shadow-lg z-50" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid var(--layout-border-color, #333333)" }}>
            {RICH_COLORS.map(c => (
              <button key={c} type="button" className="w-5 h-5 rounded-full border border-black/20" style={{ backgroundColor: c }}
                onClick={() => { exec("foreColor", c); setShowColors(false); }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface Promocao {
  id: string;
  imagem_url: string;
  botao_url: string;
  texto: string;
  oferecimento: string;
  data_inicio: string;
  data_fim: string;
  created_at: string;
}

const inputStyle: React.CSSProperties = {
  backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid var(--layout-border-color, #333333)", color: "var(--layout-page-text, #1a1a1a)", borderRadius: "20px",
};

interface PromocoesPageProps {
  effectiveUserId?: string | null;
}

export default function PromocoesPage({ effectiveUserId }: PromocoesPageProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Promocao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dataUserId, setDataUserId] = useState<string | null>(effectiveUserId ?? null);

  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [oferecimento, setOferecimento] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const textoEditorRef = useRef<HTMLDivElement>(null);
  const oferecimentoEditorRef = useRef<HTMLDivElement>(null);

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
    const [, { data }] = await Promise.all([
      supabase.rpc("cleanup_comercial"),
      supabase.from("promocoes").select("*").eq("user_id", targetUserId).order("data_inicio"),
    ]);
    setItems(data || []);
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
    const path = `promocoes/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("comercial").upload(path, compressed, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("comercial").getPublicUrl(path);
    return data.publicUrl;
  };

  const startEdit = (item: Promocao) => {
    setEditingId(item.id);
    setTitulo(item.botao_url || "");
    setTexto(item.texto);
    setTimeout(() => { if (textoEditorRef.current) textoEditorRef.current.innerHTML = item.texto || ""; }, 0);
    setOferecimento(item.oferecimento || "");
    setTimeout(() => { if (oferecimentoEditorRef.current) oferecimentoEditorRef.current.innerHTML = item.oferecimento || ""; }, 0);
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
      const botao_url = titulo;

      if (editingId) {
        const { error } = await supabase.from("promocoes").update({
          imagem_url,
          botao_url,
          texto,
          oferecimento,
          data_inicio: dataInicio,
          data_fim: dataFim,
        }).eq("id", editingId);
        if (error) throw error;
        toast({ title: "Promoção atualizada!" });
      } else {
        const { error } = await supabase.from("promocoes").insert({
          user_id: dataUserId!,
          imagem_url,
          botao_url,
          texto,
          oferecimento,
          data_inicio: dataInicio,
          data_fim: dataFim,
        });
        if (error) throw error;
        toast({ title: "Promoção salva com sucesso!" });
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
    setTitulo("");
    setTexto("");
    if (textoEditorRef.current) textoEditorRef.current.innerHTML = "";
    setOferecimento("");
    if (oferecimentoEditorRef.current) oferecimentoEditorRef.current.innerHTML = "";
    setDataInicio("");
    setDataFim("");
    setImageFile(null);
    setImagePreview("");
  };

  const handleDelete = async (id: string) => {
    await supabase.from("promocoes").delete().eq("id", id);
    await loadData();
  };

  const diasRestantes = (dataFim: string) => {
    return Math.ceil((new Date(dataFim + "T23:59:59").getTime() - Date.now()) / 86400000);
  };

  const getStatus = (item: Promocao): "ativa" | "agendada" => {
    const today = new Date().toISOString().split("T")[0];
    return item.data_inicio <= today ? "ativa" : "agendada";
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
            <h3 className="text-base font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Promoções</h3>
            <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Gerencie campanhas promocionais com banners e oferecimentos</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
            <h3 className="text-sm font-bold" style={{ color: "var(--layout-header-text, #ffffff)" }}>
              {editingId ? "✏️ Editar Promoção" : "➕ Nova Promoção"}
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
                  <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Banner da Promoção <span className="font-normal" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>(1920×850px)</span></label>
                  <div className="flex items-center gap-3">
                    {imagePreview ? (
                      <img src={imagePreview} alt="banner" className="w-24 h-14 rounded-lg object-cover" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)" }} />
                    ) : (
                      <div className="w-24 h-14 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)" }}>
                        <ImageIcon size={20} style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 30%, transparent)" }} />
                      </div>
                    )}
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold transition-all rounded-full"
                      style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", color: "var(--layout-page-text, #1a1a1a)", border: "2px solid #0d0446", borderRadius: "20px" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--layout-header-bg, #1a1a1a)"; (e.currentTarget as HTMLElement).style.color = "#ffffff"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#ffffff"; (e.currentTarget as HTMLElement).style.color = "var(--layout-header-bg, #1a1a1a)"; }}
                    >
                      <Upload size={12} /> Enviar banner
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Título da Promoção</label>
                  <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Super Burguer Positiva"
                    className="w-full px-4 py-1.5 text-sm outline-none"
                    style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Texto da Promoção</label>
                  <div className="overflow-hidden" style={{ ...inputStyle, borderRadius: "12px" }}>
                    <RichTextToolbar editorRef={textoEditorRef} onInput={() => setTexto(textoEditorRef.current?.innerHTML || "")} />
                    <div
                      ref={textoEditorRef}
                      contentEditable
                      data-placeholder="Descrição da campanha..."
                      className="w-full px-4 py-2 text-sm outline-none min-h-[80px]"
                      style={{ color: "var(--layout-page-text, #1a1a1a)", backgroundColor: "transparent" }}
                      onInput={() => setTexto(textoEditorRef.current?.innerHTML || "")}
                      suppressContentEditableWarning
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Oferecimento</label>
                  <input value={oferecimento} onChange={(e) => setOferecimento(e.target.value)} placeholder="Quem assina a promoção"
                    className="w-full px-4 py-1.5 text-sm outline-none"
                    style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Início</label>
                    <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} required
                      className="w-full px-4 py-1.5 text-sm outline-none"
                      style={inputStyle}
                      onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Fim</label>
                    <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} required
                      className="w-full px-4 py-1.5 text-sm outline-none"
                      style={inputStyle}
                      onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                    />
                  </div>
                </div>

                <button type="submit" disabled={saving}
                  className="w-full px-6 py-2 font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 rounded-full"
                  style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", color: "var(--layout-header-text, #ffffff)", border: "none" }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 15px color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 40%, transparent)"; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
                >
                  {saving ? <><Loader2 className="animate-spin" size={14} /> Salvando...</> : editingId ? "Atualizar Promoção" : "Cadastrar Promoção"}
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* List */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="px-4 py-2.5" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
            <h3 className="text-sm font-bold" style={{ color: "var(--layout-header-text, #ffffff)" }}>📋 Promoções Cadastradas</h3>
          </div>

          {items.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Nenhuma promoção cadastrada.</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="w-full text-sm" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  <thead>
                    <tr style={{ backgroundColor: "rgba(13,4,70,0.04)" }}>
                      <th className="px-4 py-2 text-left font-semibold text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Banner</th>
                      <th className="px-4 py-2 text-left font-semibold text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Título</th>
                      <th className="px-4 py-2 text-left font-semibold text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Texto</th>
                      <th className="px-4 py-2 text-left font-semibold text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Oferecimento</th>
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
                              <img src={item.imagem_url} alt="" className="w-20 h-10 rounded-lg object-cover" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }} />
                            ) : (
                              <span style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 25%, transparent)" }}>—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 max-w-[150px]">
                            <p className="truncate text-xs font-semibold">{item.botao_url || "—"}</p>
                          </td>
                          <td className="px-4 py-2 max-w-[200px]">
                            <p className="truncate text-xs">{item.texto}</p>
                          </td>
                          <td className="px-4 py-2 text-xs">{item.oferecimento || "—"}</td>
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
                          <img src={item.imagem_url} alt="" className="w-16 h-10 rounded-lg object-cover shrink-0" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }} />
                        )}
                        <div className="flex-1 min-w-0">
                          {item.botao_url && <p className="text-xs font-bold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{item.botao_url}</p>}
                          <p className="text-xs truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{item.texto}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>{item.oferecimento || "Sem oferecimento"}</p>
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
