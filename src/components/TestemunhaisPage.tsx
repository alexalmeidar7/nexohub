import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Upload, ImageIcon, Pencil, X, Save, MessageSquareQuote, Bold, Italic, Underline, Palette } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { compressImage } from "@/lib/imageCompressor";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

// Palette (nexo-form-design-system) — mesmo padrão do Cadastro de Ouvinte
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

const pillSelect: React.CSSProperties = {
  ...pillInput,
  appearance: "none",
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2300BFF0' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 18px center",
  paddingRight: 44,
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

    return () => { cancelled = true; };
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
    if (!confirm("Excluir esta citação?")) return;
    await supabase.from("testemunhais").delete().eq("id", id);
    await loadData();
  };

  const diasRestantes = (dataFim: string) => {
    return Math.ceil((new Date(dataFim + "T23:59:59").getTime() - Date.now()) / 86400000);
  };

  if (loading || !dataUserId) return <ModulePageSkeleton variant="form" />;

  const today = new Date().toLocaleDateString("pt-BR");

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
              <MessageSquareQuote size={20} style={{ color: "#FFFFFF" }} />
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, color: DARK, textTransform: "uppercase", margin: 0 }}>
                {editingId ? "Editar Citação" : "Nova Citação"}
              </h3>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "#64748B", margin: "4px 0 0" }}>
                Depoimentos de clientes vinculados a programas
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
            {/* Foto */}
            <Field label="Foto do Cliente">
              <div className="flex items-center gap-3">
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="preview"
                    style={{ width: 56, height: 56, borderRadius: 999, objectFit: "cover", border: `2px solid ${CYAN}` }}
                  />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: 999, background: "#FFFFFF", border: `2px solid ${CYAN}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ImageIcon size={20} style={{ color: CYAN }} />
                  </div>
                )}
                <label
                  style={{
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
                  }}
                >
                  <Upload size={14} /> Enviar imagem
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
              </div>
            </Field>

            {/* Programa */}
            <Field label="Vínculo com Programa">
              <select style={pillSelect} value={programaId} onChange={(e) => setProgramaId(e.target.value)}>
                <option value="">Selecione um programa</option>
                {programas.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </Field>

            {/* Texto (full width) */}
            <div className="md:col-span-2">
              <Field label="Texto da Citação">
                <div
                  style={{
                    background: "#FFFFFF",
                    border: `2px solid ${CYAN}`,
                    borderRadius: 20,
                    overflow: "hidden",
                  }}
                >
                  <RichTextToolbar
                    editorRef={editorRef}
                    onInput={() => { if (editorRef.current) setTexto(editorRef.current.innerHTML); }}
                  />
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    className="w-full px-5 py-3 text-sm outline-none min-h-[100px] max-h-[220px] overflow-y-auto"
                    style={{ color: DARK, background: "transparent", fontFamily: "'Montserrat', sans-serif" }}
                    onInput={() => { if (editorRef.current) setTexto(editorRef.current.innerHTML); }}
                    data-placeholder="Relato do cliente..."
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
              {editingId ? "Atualizar Citação" : "Cadastrar Citação"}
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
            <MessageSquareQuote size={18} style={{ color: CYAN }} />
            <h3 style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>
              Citações Cadastradas
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
            Nenhuma citação cadastrada.
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block" style={{ overflowX: "auto", borderRadius: 16, border: `1px solid ${CARD_BG}` }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
                <thead>
                  <tr style={{ background: CYAN, color: "#FFFFFF" }}>
                    {["Imagem", "Texto", "Programa", "Validade", "Ações"].map((h) => (
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
                            <img src={item.imagem_url} alt="" style={{ width: 40, height: 40, borderRadius: 999, objectFit: "cover", border: `2px solid ${CYAN}` }} />
                          ) : (
                            <span style={{ color: "#94A3B8" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 14px", maxWidth: 260 }}>
                          <div
                            className="truncate"
                            style={{ fontSize: 12 }}
                            dangerouslySetInnerHTML={{ __html: item.texto }}
                          />
                        </td>
                        <td style={{ padding: "12px 14px" }}>{item.programa?.nome || "—"}</td>
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
                        <img src={item.imagem_url} alt="" style={{ width: 44, height: 44, borderRadius: 999, objectFit: "cover", border: `2px solid ${CYAN}`, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: 999, background: CARD_BG, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <ImageIcon size={16} style={{ color: CYAN }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          className="line-clamp-2"
                          style={{ fontSize: 12, color: DARK }}
                          dangerouslySetInnerHTML={{ __html: item.texto }}
                        />
                        <p style={{ fontSize: 10, color: "#64748B", marginTop: 4, fontWeight: 600 }}>
                          {item.programa?.nome || "Sem programa"}
                        </p>
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
