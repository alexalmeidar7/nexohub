import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Upload, ImageIcon, Pencil, X, Bold, Italic, Underline, Palette, Save, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { compressImage } from "@/lib/imageCompressor";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

// Palette (nexo-form-design-system) — mesmo padrão do Cadastro de Ouvinte / Citações
const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const CARD_BG = "#D6F4FB";
const DARK = "#0A2540";

const TOOLBAR_COLORS = ["#000000", "#dc2626", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#db2777", CYAN];

const pillInput: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 999,
  background: "#FFFFFF",
  border: `2px solid ${CYAN}`,
  padding: "0 20px",
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 13,
  color: DARK,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: DARK,
  marginBottom: 8,
  display: "block",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function RichTextToolbar({ editorRef, onInput }: { editorRef: React.RefObject<HTMLDivElement>; onInput: () => void }) {
  const [showColors, setShowColors] = useState(false);

  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    onInput();
  };

  const btnStyle: React.CSSProperties = {
    background: "#FFFFFF",
    color: DARK,
    border: `1px solid ${CYAN}`,
    borderRadius: 999,
    width: 30,
    height: 30,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    position: "relative",
  };

  return (
    <div style={{
      display: "flex",
      gap: 6,
      padding: "8px 12px",
      background: CARD_BG,
      borderBottom: `2px solid ${CYAN}`,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    }}>
      <button type="button" style={btnStyle} onClick={() => exec("bold")} title="Negrito"><Bold size={14} /></button>
      <button type="button" style={btnStyle} onClick={() => exec("italic")} title="Itálico"><Italic size={14} /></button>
      <button type="button" style={btnStyle} onClick={() => exec("underline")} title="Sublinhado"><Underline size={14} /></button>
      <div style={{ position: "relative" }}>
        <button type="button" style={btnStyle} onClick={() => setShowColors(!showColors)} title="Cor do texto"><Palette size={14} /></button>
        {showColors && (
          <div style={{ position: "absolute", top: 36, left: 0, zIndex: 20, background: "#FFFFFF", border: `2px solid ${CYAN}`, borderRadius: 16, padding: 8, display: "flex", gap: 5, boxShadow: "0 10px 24px rgba(10,37,64,0.15)" }}>
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

interface Promocao {
  id: string;
  imagem_url: string;
  banner_l_url?: string;
  botao_url: string;
  texto: string;
  oferecimento: string;
  data_inicio: string;
  data_fim: string;
  created_at: string;
}

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
  const [bannerLFile, setBannerLFile] = useState<File | null>(null);
  const [bannerLPreview, setBannerLPreview] = useState("");
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

    return () => { cancelled = true; };
  }, [user, effectiveUserId]);

  const loadData = async (targetUserId = dataUserId) => {
    if (!targetUserId) return;
    setLoading(true);
    try {
      const [, { data }] = await Promise.all([
        supabase.rpc("cleanup_comercial"),
        supabase.from("promocoes").select("*").eq("user_id", targetUserId).order("data_inicio"),
      ]);
      setItems(data || []);
    } finally {
      setLoading(false);
    }
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

  const handleBannerLChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerLFile(file);
    setBannerLPreview(URL.createObjectURL(file));
  };

  const uploadImage = async (file: File, prefix = "promocoes"): Promise<string> => {
    const compressed = await compressImage(file);
    const ext = compressed.name.split(".").pop() || "jpg";
    const path = `${prefix}/${Date.now()}.${ext}`;
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
    setBannerLPreview(item.banner_l_url || "");
    setBannerLFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !dataUserId) return;
    if (!texto || !dataInicio || !dataFim) {
      toast({ title: "Preencha texto, data de início e fim", variant: "destructive" });
      return;
    }
    setSaving(true);

    try {
      let imagem_url = editingId ? imagePreview : "";
      if (imageFile) imagem_url = await uploadImage(imageFile);

      let banner_l_url = editingId ? bannerLPreview : "";
      if (bannerLFile) banner_l_url = await uploadImage(bannerLFile);

      const botao_url = titulo;

      if (editingId) {
        const { error } = await supabase.from("promocoes").update({
          imagem_url,
          banner_l_url,
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
          user_id: dataUserId,
          imagem_url,
          banner_l_url,
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
    setBannerLFile(null);
    setBannerLPreview("");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta promoção?")) return;
    await supabase.from("promocoes").delete().eq("id", id);
    await loadData();
  };

  const diasRestantes = (dataFim: string) => {
    return Math.ceil((new Date(dataFim + "T23:59:59").getTime() - Date.now()) / 86400000);
  };

  const stripHtml = (html: string) =>
    (html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  const previewTexto = (html: string, max = 110) => {
    const clean = stripHtml(html);
    return clean.length > max ? clean.slice(0, max).trimEnd() + "…" : clean;
  };
  const tituloPromocao = (html: string) => {
    const clean = stripHtml(html);
    if (!clean) return "Sem título";
    return clean.length > 60 ? clean.slice(0, 60).trimEnd() + "…" : clean;
  };
  const formatDate = (d: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  if (loading || !dataUserId) return <ModulePageSkeleton variant="form" />;

  const today = new Date().toLocaleDateString("pt-BR");

  const uploadBoxStyle: React.CSSProperties = {
    ...pillInput,
    flex: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    cursor: "pointer",
    background: "#FFFFFF",
  };

  return (
    <div className="space-y-8 animate-fade-in" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* FORM CARD */}
      <section
        style={{
          background: CARD_BG,
          borderRadius: 28,
          padding: "28px 32px 32px",
          boxShadow: "0 2px 12px rgba(10, 37, 64, 0.05)",
        }}
      >
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div style={{ width: 40, height: 40, borderRadius: 999, background: CYAN, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Tag size={20} style={{ color: "#FFFFFF" }} />
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, color: DARK, textTransform: "uppercase", margin: 0 }}>
                {editingId ? "Editar Promoção" : "Nova Promoção"}
              </h3>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "#64748B", margin: "4px 0 0" }}>
                Campanhas promocionais com banners e oferecimentos
              </p>
            </div>
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: DARK,
              background: "#FFFFFF",
              padding: "6px 16px",
              borderRadius: 999,
              border: `2px solid ${CYAN}`,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Data do cadastro: <span style={{ color: CYAN }}>{editingId ? "—" : today}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            {/* Banner principal */}
            <Field label="Banner da Promoção (1920×850px)">
              <div className="flex items-center gap-3">
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="preview"
                    style={{ width: 72, height: 44, borderRadius: 12, objectFit: "cover", border: `2px solid ${CYAN}` }}
                  />
                ) : (
                  <div style={{ width: 72, height: 44, borderRadius: 12, background: "#FFFFFF", border: `2px solid ${CYAN}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ImageIcon size={18} style={{ color: CYAN }} />
                  </div>
                )}
                <label style={uploadBoxStyle}>
                  <Upload size={14} /> Enviar banner
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
              </div>
            </Field>

            {/* Banner L */}
            <Field label="Banner L (PNG)">
              <div className="flex items-center gap-3">
                {bannerLPreview ? (
                  <img
                    src={bannerLPreview}
                    alt="banner L"
                    style={{ width: 72, height: 44, borderRadius: 12, objectFit: "cover", border: `2px solid ${CYAN}` }}
                  />
                ) : (
                  <div style={{ width: 72, height: 44, borderRadius: 12, background: "#FFFFFF", border: `2px solid ${CYAN}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ImageIcon size={18} style={{ color: CYAN }} />
                  </div>
                )}
                <label style={uploadBoxStyle}>
                  <Upload size={14} /> Enviar banner L
                  <input type="file" accept="image/png" className="hidden" onChange={handleBannerLChange} />
                </label>
              </div>
            </Field>

            {/* Título */}
            <div className="md:col-span-2">
              <Field label="Título da Promoção">
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Super Burguer Positiva"
                  style={pillInput}
                />
              </Field>
            </div>

            {/* Texto (full width) */}
            <div className="md:col-span-2">
              <Field label="Texto da Promoção">
                <div
                  style={{
                    background: "#FFFFFF",
                    border: `2px solid ${CYAN}`,
                    borderRadius: 20,
                    overflow: "hidden",
                  }}
                >
                  <RichTextToolbar
                    editorRef={textoEditorRef}
                    onInput={() => { if (textoEditorRef.current) setTexto(textoEditorRef.current.innerHTML); }}
                  />
                  <div
                    ref={textoEditorRef}
                    contentEditable
                    suppressContentEditableWarning
                    className="w-full px-5 py-3 text-sm outline-none min-h-[100px] max-h-[220px] overflow-y-auto"
                    style={{ color: DARK, background: "transparent", fontFamily: "'Montserrat', sans-serif" }}
                    onInput={() => { if (textoEditorRef.current) setTexto(textoEditorRef.current.innerHTML); }}
                    data-placeholder="Descrição da campanha..."
                  />
                </div>
              </Field>
            </div>

            {/* Oferecimento (full width) */}
            <div className="md:col-span-2">
              <Field label="Oferecimento">
                <div
                  style={{
                    background: "#FFFFFF",
                    border: `2px solid ${CYAN}`,
                    borderRadius: 20,
                    overflow: "hidden",
                  }}
                >
                  <RichTextToolbar
                    editorRef={oferecimentoEditorRef}
                    onInput={() => { if (oferecimentoEditorRef.current) setOferecimento(oferecimentoEditorRef.current.innerHTML); }}
                  />
                  <div
                    ref={oferecimentoEditorRef}
                    contentEditable
                    suppressContentEditableWarning
                    className="w-full px-5 py-3 text-sm outline-none min-h-[80px] max-h-[180px] overflow-y-auto"
                    style={{ color: DARK, background: "transparent", fontFamily: "'Montserrat', sans-serif" }}
                    onInput={() => { if (oferecimentoEditorRef.current) setOferecimento(oferecimentoEditorRef.current.innerHTML); }}
                    data-placeholder="Quem assina a promoção..."
                  />
                </div>
              </Field>
            </div>

            {/* Datas */}
            <Field label="Início">
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                required
                style={pillInput}
              />
            </Field>
            <Field label="Fim">
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                required
                style={pillInput}
              />
            </Field>
          </div>

          <div className="mt-8 flex items-center justify-end gap-3">
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                style={{
                  height: 44,
                  padding: "0 22px",
                  borderRadius: 999,
                  background: "#FFFFFF",
                  border: `2px solid ${CYAN}`,
                  color: DARK,
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  fontFamily: "'Montserrat', sans-serif",
                }}
              >
                <X size={16} /> Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              style={{
                height: 44,
                padding: "0 28px",
                borderRadius: 999,
                background: LIME,
                border: "none",
                color: DARK,
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: 2,
                textTransform: "uppercase",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1,
                boxShadow: "0 4px 14px rgba(198, 240, 60, 0.35)",
                fontFamily: "'Montserrat', sans-serif",
              }}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {editingId ? "Atualizar Promoção" : "Cadastrar Promoção"}
            </button>
          </div>
        </form>
      </section>

      {/* LIST CARD */}
      <section
        style={{
          background: "#FFFFFF",
          borderRadius: 28,
          padding: "20px 24px 28px",
          border: "1px solid #E5F5FB",
          boxShadow: "0 2px 12px rgba(10, 37, 64, 0.04)",
        }}
      >
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div className="flex items-center gap-2" style={{ color: DARK }}>
            <Tag size={18} style={{ color: CYAN }} />
            <h3 style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>
              Promoções Cadastradas
            </h3>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                background: CARD_BG,
                color: DARK,
                padding: "3px 12px",
                borderRadius: 999,
              }}
            >
              {items.length}
            </span>
          </div>
        </div>

        {items.length === 0 ? (
          <p style={{ fontSize: 13, color: "#64748B", textAlign: "center", padding: "40px 0" }}>
            Nenhuma promoção cadastrada.
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block" style={{ overflowX: "auto", borderRadius: 16, border: `1px solid ${CARD_BG}` }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
                <thead>
                  <tr style={{ background: CYAN, color: "#FFFFFF" }}>
                    {["Banner", "Título", "Texto", "Oferecimento", "Validade", "Ações"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "12px 14px",
                          textAlign: h === "Ações" ? "right" : "left",
                          fontWeight: 800,
                          letterSpacing: 1.2,
                          textTransform: "uppercase",
                          fontSize: 10,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const dias = diasRestantes(item.data_fim);
                    const expiring = dias <= 3;
                    return (
                      <tr
                        key={item.id}
                        style={{
                          background: idx % 2 === 0 ? "#FFFFFF" : "#F7FCFE",
                          color: DARK,
                        }}
                      >
                        <td style={{ padding: "12px 14px" }}>
                          {item.imagem_url ? (
                            <img src={item.imagem_url} alt="" style={{ width: 72, height: 40, borderRadius: 10, objectFit: "cover", border: `2px solid ${CYAN}` }} />
                          ) : (
                            <span style={{ color: "#94A3B8" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 14px", maxWidth: 180, fontWeight: 700 }}>
                          <div className="truncate">{item.botao_url || <span style={{ color: "#94A3B8" }}>—</span>}</div>
                        </td>
                        <td style={{ padding: "12px 14px", maxWidth: 240 }}>
                          <div
                            className="truncate"
                            style={{ fontSize: 12 }}
                            dangerouslySetInnerHTML={{ __html: item.texto }}
                          />
                        </td>
                        <td style={{ padding: "12px 14px", maxWidth: 180 }}>
                          <div
                            className="truncate"
                            style={{ fontSize: 12 }}
                            dangerouslySetInnerHTML={{ __html: item.oferecimento || "—" }}
                          />
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 10px",
                              borderRadius: 999,
                              fontWeight: 800,
                              fontSize: 10,
                              letterSpacing: 1,
                              textTransform: "uppercase",
                              background: expiring ? "#FEE2E2" : CARD_BG,
                              color: expiring ? "#DC2626" : DARK,
                            }}
                          >
                            {dias}d {dias === 1 ? "restante" : "restantes"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 6 }}>
                            <button
                              onClick={() => startEdit(item)}
                              title="Editar"
                              style={{
                                width: 30, height: 30, borderRadius: "50%",
                                background: CARD_BG, border: "none", cursor: "pointer",
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                color: DARK,
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              title="Excluir"
                              style={{
                                width: 30, height: 30, borderRadius: "50%",
                                background: "#FEE2E2", border: "none", cursor: "pointer",
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                color: "#DC2626",
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {items.map((item) => {
                const dias = diasRestantes(item.data_fim);
                const expiring = dias <= 3;
                return (
                  <div
                    key={item.id}
                    style={{
                      background: "#FFFFFF",
                      border: `1px solid ${CARD_BG}`,
                      borderRadius: 20,
                      padding: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      boxShadow: "0 2px 8px rgba(10, 37, 64, 0.04)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      {item.imagem_url ? (
                        <img src={item.imagem_url} alt="" style={{ width: 72, height: 44, borderRadius: 10, objectFit: "cover", border: `2px solid ${CYAN}`, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 72, height: 44, borderRadius: 10, background: CARD_BG, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <ImageIcon size={16} style={{ color: CYAN }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {item.botao_url && <p style={{ fontSize: 12, fontWeight: 800, color: DARK, margin: 0 }} className="truncate">{item.botao_url}</p>}
                        <div
                          className="line-clamp-2"
                          style={{ fontSize: 12, color: DARK, marginTop: 2 }}
                          dangerouslySetInnerHTML={{ __html: item.texto }}
                        />
                        <div
                          style={{ fontSize: 10, color: "#64748B", marginTop: 4, fontWeight: 600 }}
                          dangerouslySetInnerHTML={{ __html: item.oferecimento || "Sem oferecimento" }}
                        />
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontWeight: 800,
                          fontSize: 10,
                          letterSpacing: 1,
                          textTransform: "uppercase",
                          background: expiring ? "#FEE2E2" : CARD_BG,
                          color: expiring ? "#DC2626" : DARK,
                        }}
                      >
                        {dias}d {dias === 1 ? "restante" : "restantes"}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => startEdit(item)}
                          style={{
                            width: 30, height: 30, borderRadius: "50%",
                            background: CARD_BG, border: "none", cursor: "pointer",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            color: DARK,
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          style={{
                            width: 30, height: 30, borderRadius: "50%",
                            background: "#FEE2E2", border: "none", cursor: "pointer",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            color: "#DC2626",
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
