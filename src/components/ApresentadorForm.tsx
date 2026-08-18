import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Instagram, UserCheck, UserX, Trash2, Pencil, X, Loader2, CheckCircle, UserPlus, Camera, Shield, Phone, FileSpreadsheet, Search } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uploadImageToStorage } from "@/lib/uploadImageToStorage";
import * as XLSX from "xlsx";
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
  background_url?: string | null;
  ativo: boolean;
}

const CATEGORIA_OPTIONS = ["Apresentador", "Jornalista", "Convidado"];

// IMPORTANT: keep Field defined OUTSIDE the component. Declaring components
// inside another component recreates them on every render, which unmounts
// their children and causes inputs/combos to lose focus mid-interaction.
const FIELD_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "#0A2540",
  marginBottom: 8,
  display: "block",
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label style={FIELD_LABEL_STYLE}>{label}</label>
    {children}
  </div>
);

export async function getApresentadores(): Promise<Apresentador[]> {
  const { data } = await supabase.from("apresentadores").select("*");
  if (!data) return [];
  return data.map(a => ({
    id: a.id,
    nome: a.nome,
    cargo: a.cargo || "",
    instagram: a.instagram || "",
    whatsapp: (a as any).whatsapp || "",
    foto: a.foto || "",
    background_url: (a as any).background_url || "",
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
  const [whatsapp, setWhatsapp] = useState("+55");
  const [foto, setFoto] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const [filterCategoria, setFilterCategoria] = useState("todos");
  const [searchNome, setSearchNome] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [catOpen, setCatOpen] = useState(false);
  const [importRows, setImportRows] = useState<any[] | null>(null);
  const [importing, setImporting] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [editingCell, setEditingCell] = useState<{ id: string, field: string } | null>(null);

  const updateField = async (id: string, field: string, value: any) => {
    const { error } = await supabase.from("apresentadores").update({ [field]: value }).eq("id", id);
    if (error) {
      console.error(`Erro ao atualizar campo ${field}:`, error);
      alert("Erro ao salvar: " + error.message);
    } else {
      setApresentadores(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
      // Dispara atualização imediata dos XMLs
      try {
        window.dispatchEvent(new CustomEvent("apresentadores-updated"));
      } catch {}
    }
  };

  const load = async () => {
    setLoadingList(true);
    try {
      const list = await getApresentadores();
      list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      setApresentadores(list);
    } finally {
      setLoadingList(false);
    }
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
    setNome(""); setCategoria(""); setCargoConvidado(""); setInstagram(""); setWhatsapp("+55"); setFoto(""); setBackgroundUrl(""); setAtivo(true); setEditingId(null);
  };

  const handleSave = async () => {
    if (!nome.trim() || !user || !categoria) return;
    setSaving(true);

    // Para "Convidado" com cargo livre (Médico, Advogado...), grava o cargo digitado.
    // Caso contrário, grava a própria categoria (Apresentador/Jornalista/Convidado).
    const cargoValue = categoria === "Convidado" && cargoConvidado.trim()
      ? cargoConvidado.trim()
      : categoria;

    // Upload photo to storage if it's base64
    let fotoUrl = showFoto ? foto : "";
    if (fotoUrl && fotoUrl.startsWith("data:")) {
      const targetId = editingId || crypto.randomUUID();
      const path = `apresentadores/${user.id}/${targetId}.webp`;
      fotoUrl = await uploadImageToStorage(fotoUrl, "empresa-assets", path);
    }

    let finalBackgroundUrl = backgroundUrl;
    if (finalBackgroundUrl && finalBackgroundUrl.startsWith("data:")) {
      const targetId = editingId || crypto.randomUUID();
      const path = `apresentadores/${user.id}/${targetId}-bg.webp`;
      finalBackgroundUrl = await uploadImageToStorage(finalBackgroundUrl, "empresa-assets", path);
    }

    const payload = {
      nome: nome.trim(),
      cargo: cargoValue,
      instagram: instagram.trim(),
      whatsapp: whatsapp.replace(/\D/g, "").length >= 10 ? whatsapp.trim() : "",
      foto: fotoUrl,
      background_url: finalBackgroundUrl,
      ativo,
    };

    let error: any = null;
    if (editingId) {
      const res = await supabase.from("apresentadores").update(payload as any).eq("id", editingId);
      error = res.error;
    } else {
      const res = await supabase.from("apresentadores").insert({ user_id: user.id, ...payload } as any);
      error = res.error;
    }

    if (error) {
      console.error("Erro ao salvar apresentador:", error);
      alert("Erro ao salvar: " + error.message);
      setSaving(false);
      return;
    }

    // Dispara atualização imediata dos XMLs que dependem de apresentadores
    try {
      window.dispatchEvent(new CustomEvent("apresentadores-updated"));
    } catch {}

    await load();
    resetForm();
    setSaving(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  const startEdit = (a: Apresentador) => {
    setEditingId(a.id);
    setNome(a.nome);
    // Se o cargo gravado é uma das categorias padrão, é a categoria.
    // Caso contrário, trata-se de um Convidado com cargo livre.
    if (CATEGORIA_OPTIONS.includes(a.cargo)) {
      setCategoria(a.cargo);
      setCargoConvidado("");
    } else {
      setCategoria("Convidado");
      setCargoConvidado(a.cargo || "");
    }
    setInstagram(a.instagram);
    setWhatsapp(a.whatsapp || "+55");
    setFoto(a.foto);
    setAtivo(a.ativo);
    // Scroll suave até o formulário no topo
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
  };

  const formatWhatsapp = (value: string) => {
    // Strip everything except digits
    let digits = value.replace(/\D/g, "");
    
    // If it starts with 55, keep it. If not, we might add it later or assume it's part of the number.
    // However, the request asks for +55 (XX) XXXXX-XXXX
    
    // If user starts typing and it's not 55, we could prepend 55, 
    // but often users type the DDD directly.
    // Let's force +55 as the start if it's long enough or empty.
    
    if (digits.length <= 2 && !digits.startsWith("55") && digits !== "") {
      // If user types DDD without 55, we could auto-prepend 55
      // but let's just format what we have.
    }

    // Maximum length for +55 (XX) XXXXX-XXXX is 13 digits (55 + 2 + 9)
    digits = digits.slice(0, 13);
    
    if (digits.length === 0) return "";
    
    let formatted = "+";
    
    // Country code (up to 2 digits, usually 55)
    if (digits.length > 0) {
      formatted += digits.slice(0, 2);
    }
    
    // DDD (up to 2 digits)
    if (digits.length > 2) {
      formatted += " (" + digits.slice(2, 4);
    }
    
    // Closing parenthesis
    if (digits.length >= 4) {
      formatted += ") ";
    }
    
    // First part of number (5 digits for mobile)
    if (digits.length > 4) {
      formatted += digits.slice(4, 9);
    }
    
    // Dash and last part (4 digits)
    if (digits.length > 9) {
      formatted += "-" + digits.slice(9, 13);
    }
    
    return formatted;
  };

  const toggleAtivo = async (id: string, current: boolean) => {
    await supabase.from("apresentadores").update({ ativo: !current }).eq("id", id);
    await load();
  };

  const removeApresentador = async (id: string) => {
    await supabase.from("apresentadores").delete().eq("id", id);
    await load();
  };

  const handleExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        // Skip header row, filter empty rows
        const dataRows = rows.slice(1).filter(r => r.length >= 2 && r[1]?.toString().trim());
        const mapped = dataRows.map(r => ({
          categoria: (r[0] || "Convidado").toString().trim(),
          nome: (r[1] || "").toString().trim(),
          cargo: (r[2] || "").toString().trim(),
          instagram: (r[3] || "").toString().trim(),
          whatsapp: (r[4] || "").toString().trim(),
          ativo: r[5] !== undefined ? String(r[5]).toLowerCase() !== "inativo" && String(r[5]) !== "0" && String(r[5]).toLowerCase() !== "false" : true,
        }));
        if (mapped.length > 0) {
          setImportRows(mapped);
        }
      } catch { }
    };
    reader.readAsArrayBuffer(file);
    if (excelInputRef.current) excelInputRef.current.value = "";
  };

  const confirmImport = async () => {
    if (!importRows || !user) return;
    setImporting(true);
    const inserts = importRows.map(r => ({
      user_id: user.id,
      nome: r.nome,
      cargo: CATEGORIA_OPTIONS.includes(r.categoria) ? r.categoria : r.cargo || "Convidado",
      instagram: r.instagram,
      whatsapp: r.whatsapp,
      foto: "",
      ativo: r.ativo,
    }));
    await supabase.from("apresentadores").insert(inserts as any);
    setImportRows(null);
    setImporting(false);
    await load();
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  const filtered = apresentadores
    .filter(a => filterCategoria === "todos" || a.cargo === filterCategoria)
    .filter(a => !searchNome || a.nome.toLowerCase().includes(searchNome.toLowerCase()));

  const stats = {
    total: apresentadores.length,
    ativos: apresentadores.filter(a => a.ativo).length,
    inativos: apresentadores.filter(a => !a.ativo).length,
  };

  // === Nexo Form Design System (mesmo do Cadastro de Ouvinte) ===
  const CYAN = "#00BFF0";
  const LIME = "#C6F03C";
  const CARD_BG = "#D6F4FB";
  const DARK = "#0A2540";

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

  // Field foi movido para fora do componente (ver FieldRow abaixo) para evitar
  // remontagem a cada render, o que fazia o foco sair dos inputs/combos.

  if (loadingList && apresentadores.length === 0) {
    return <ModulePageSkeleton />;
  }

  return (
    <div className="animate-fade-in space-y-8" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        Cadastro de Participantes
      </div>

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
          <h3
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 2,
              color: DARK,
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            {editingId ? "Editar Participante" : "Cadastro de Participante"}
          </h3>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              userSelect: "none",
              background: "#FFFFFF",
              border: `2px solid ${CYAN}`,
              borderRadius: 999,
              padding: "6px 14px",
            }}
          >
            <div style={{ position: "relative", width: 34, height: 18 }}>
              <input
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
                style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 999,
                  background: ativo ? LIME : "#E2E8F0",
                  transition: "background 0.2s",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: ativo ? 18 : 2,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "#FFFFFF",
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, color: DARK, letterSpacing: 1.5, textTransform: "uppercase" }}>
              {ativo ? "Ativo" : "Inativo"}
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
          <Field label="Categoria">
            <select style={pillSelect} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Selecione</option>
              {CATEGORIA_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <div className="lg:col-span-2">
            <Field label="Nome Completo">
              <input style={pillInput} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
            </Field>
          </div>

          {categoria === "Convidado" && (
            <Field label="Cargo">
              <input style={pillInput} value={cargoConvidado} onChange={(e) => setCargoConvidado(e.target.value)} placeholder="Ex.: Médico, Advogado..." />
            </Field>
          )}

          <Field label="Instagram">
            <input style={pillInput} value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario_instagram" />
          </Field>

          <Field label="WhatsApp">
            <input
              style={pillInput}
              value={whatsapp}
              onChange={(e) => setWhatsapp(formatWhatsapp(e.target.value))}
              onFocus={() => { if (!whatsapp) setWhatsapp("+55 "); }}
              placeholder="+55 (00) 00000-0000"
            />
          </Field>

          {showFoto && (
            <div className="md:col-span-2 lg:col-span-3">
              <label style={labelStyle}>Foto (1080 × 1080 px — PNG com fundo transparente)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <label
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: 20,
                    background: "#FFFFFF",
                    border: `2px dashed ${CYAN}`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    overflow: "hidden",
                  }}
                >
                  {foto ? (
                    <img src={foto} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <>
                      <Camera size={22} style={{ color: CYAN }} />
                      <span style={{ fontSize: 9, color: DARK, marginTop: 4, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>Upload</span>
                    </>
                  )}
                  <input type="file" accept="image/*" onChange={handleFoto} style={{ display: "none" }} />
                </label>
                {foto && (
                  <button
                    onClick={() => setFoto("")}
                    style={{
                      background: "#FEE2E2",
                      color: "#DC2626",
                      border: "none",
                      borderRadius: 999,
                      padding: "8px 16px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    Remover foto
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 flex items-center justify-end gap-3">
          {editingId && (
            <button
              onClick={resetForm}
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
              }}
            >
              <X size={16} /> Cancelar
            </button>
          )}
          <label
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
            }}
          >
            <FileSpreadsheet size={14} /> Importar Excel
            <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelFile} style={{ display: "none" }} />
          </label>
          <button
            onClick={handleSave}
            disabled={saving || !nome.trim() || !categoria}
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
              opacity: saving || !nome.trim() || !categoria ? 0.6 : 1,
              boxShadow: "0 4px 14px rgba(198, 240, 60, 0.35)",
            }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {editingId ? "Atualizar" : "Salvar"}
          </button>
        </div>
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
          <div className="flex items-center gap-3 flex-wrap" style={{ color: DARK }}>
            <UserPlus size={18} style={{ color: CYAN }} />
            <h3 style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>
              Participantes Cadastrados
            </h3>
            <span style={{ fontSize: 11, fontWeight: 700, background: CARD_BG, color: DARK, padding: "3px 12px", borderRadius: 999 }}>
              {stats.total}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, background: "#DCFCE7", color: "#166534", padding: "3px 12px", borderRadius: 999 }}>
              {stats.ativos} ativos
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, background: "#FEE2E2", color: "#991B1B", padding: "3px 12px", borderRadius: 999 }}>
              {stats.inativos} inativos
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: CYAN }} />
              <input
                value={searchNome}
                onChange={(e) => setSearchNome(e.target.value)}
                placeholder="Buscar nome"
                style={{ ...pillInput, width: 240, paddingLeft: 40, height: 40, fontSize: 12 }}
              />
            </div>
            <select
              value={filterCategoria}
              onChange={(e) => setFilterCategoria(e.target.value)}
              style={{ ...pillSelect, width: 170, height: 40, fontSize: 12 }}
            >
              <option value="todos">Todos</option>
              {CATEGORIA_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {loadingList ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#64748B", fontSize: 13 }}>
            <Loader2 className="animate-spin inline" size={18} />
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize: 13, color: "#64748B", textAlign: "center", padding: "40px 0" }}>
            Nenhum participante cadastrado.
          </p>
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 16, border: `1px solid ${CARD_BG}` }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
              <thead>
                <tr style={{ background: CYAN, color: "#FFFFFF" }}>
                  {["Categoria", "Nome", "Cargo", "Instagram", "WhatsApp", "Foto", "Status", "Ações"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 14px",
                        textAlign: h === "Ações" || h === "Status" || h === "Foto" ? "center" : "left",
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
                {filtered.map((a, idx) => {
                  const cat = CATEGORIA_OPTIONS.includes(a.cargo) ? a.cargo : "Convidado";
                  return (
                    <tr key={a.id} style={{ background: idx % 2 === 0 ? "#FFFFFF" : "#F7FCFE", color: DARK }}>
                      <td style={{ padding: "10px 14px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 12px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 800,
                            letterSpacing: 0.6,
                            background:
                              cat === "Apresentador" ? "#DBEAFE" : cat === "Jornalista" ? "#E0F2FE" : "#FEF3C7",
                            color:
                              cat === "Apresentador" ? "#1D4ED8" : cat === "Jornalista" ? "#0369A1" : "#92400E",
                          }}
                        >
                          {cat}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 700 }}>{a.nome}</td>
                      <td style={{ padding: "10px 14px" }}>{a.cargo || "—"}</td>
                      <td style={{ padding: "10px 14px" }}>
                        {a.instagram ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <Instagram size={12} style={{ color: "#E1306C" }} />
                            {a.instagram}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {a.whatsapp ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <Phone size={12} style={{ color: "#25D366" }} />
                            {a.whatsapp}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        {a.foto ? (
                          <img src={a.foto} alt={a.nome} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", display: "inline-block", border: `1px solid ${CARD_BG}` }} />
                        ) : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "3px 10px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 800,
                            background: a.ativo ? "#DCFCE7" : "#FEE2E2",
                            color: a.ativo ? "#166534" : "#991B1B",
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: a.ativo ? "#22C55E" : "#DC2626" }} />
                          {a.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button
                            onClick={() => startEdit(a)}
                            title="Editar"
                            style={{ width: 30, height: 30, borderRadius: "50%", background: CARD_BG, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: DARK }}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => toggleAtivo(a.id, a.ativo)}
                            title={a.ativo ? "Desativar" : "Ativar"}
                            style={{ width: 30, height: 30, borderRadius: "50%", background: a.ativo ? "#DCFCE7" : "#FEE2E2", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: a.ativo ? "#166534" : "#991B1B" }}
                          >
                            {a.ativo ? <UserCheck size={14} /> : <UserX size={14} />}
                          </button>
                          <button
                            onClick={() => removeApresentador(a.id)}
                            title="Remover"
                            style={{ width: 30, height: 30, borderRadius: "50%", background: "#FEE2E2", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#DC2626" }}
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
        )}
      </section>

      {/* Import Confirmation Popup */}
      {importRows && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10, 37, 64, 0.5)" }}>
          <div
            style={{
              width: 440,
              background: CARD_BG,
              borderRadius: 28,
              padding: 32,
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(10, 37, 64, 0.35)",
            }}
          >
            <FileSpreadsheet size={40} style={{ color: CYAN, margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: DARK, margin: "0 0 20px" }}>
              Deseja importar <span style={{ color: CYAN, fontWeight: 800 }}>{importRows.length}</span> participante{importRows.length > 1 ? "s" : ""}?
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                onClick={() => setImportRows(null)}
                disabled={importing}
                style={{
                  height: 42, padding: "0 22px", borderRadius: 999,
                  background: "#FFFFFF", border: `2px solid ${CYAN}`, color: DARK,
                  fontWeight: 700, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmImport}
                disabled={importing}
                style={{
                  height: 42, padding: "0 28px", borderRadius: 999,
                  background: LIME, border: "none", color: DARK,
                  fontWeight: 800, fontSize: 12, letterSpacing: 2, textTransform: "uppercase",
                  display: "inline-flex", alignItems: "center", gap: 8,
                  cursor: importing ? "wait" : "pointer",
                }}
              >
                {importing && <Loader2 size={14} className="animate-spin" />}
                {importing ? "Importando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10, 37, 64, 0.4)" }}>
          <div
            style={{
              width: 420, padding: "28px 32px", background: CARD_BG, borderRadius: 24,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
              boxShadow: "0 20px 60px rgba(10, 37, 64, 0.3)",
            }}
          >
            <CheckCircle size={24} style={{ color: CYAN }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: DARK, letterSpacing: 1, textTransform: "uppercase" }}>
              Salvo com sucesso!
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

