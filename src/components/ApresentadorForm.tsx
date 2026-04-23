import { useState, useEffect, useRef } from "react";
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
    whatsapp: (a as any).whatsapp || "",
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
  const [whatsapp, setWhatsapp] = useState("+55");
  const [foto, setFoto] = useState("");
  const [ativo, setAtivo] = useState(true);
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
    setNome(""); setCategoria(""); setCargoConvidado(""); setInstagram(""); setWhatsapp("+55"); setFoto(""); setAtivo(true); setEditingId(null);
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

    const payload = {
      nome: nome.trim(),
      cargo: cargoValue,
      instagram: instagram.trim(),
      whatsapp: whatsapp.replace(/\D/g, "").length > 2 ? whatsapp.trim() : "",
      foto: fotoUrl,
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
    // Strip non-digits, but always keep 55 prefix
    let digits = value.replace(/\D/g, "");
    // If user somehow removed the 55 prefix, restore it
    if (!digits.startsWith("55")) {
      digits = "55" + digits.replace(/^55*/, "");
    }
    digits = digits.slice(0, 13); // 55 + 2 DDD + 9 digits
    let formatted = "+55";
    const local = digits.slice(2); // after country code
    if (local.length > 0) formatted += " (" + local.slice(0, 2);
    if (local.length >= 2) formatted += ")";
    if (local.length > 2) formatted += " " + local.slice(2, 7);
    if (local.length > 7) formatted += "-" + local.slice(7, 11);
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

  const listSkeleton = (
    <div className="space-y-3 mt-6">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 w-28 rounded bg-[var(--layout-header-bg)]/15" />
        <Skeleton className="h-7 w-[160px] rounded-full bg-[var(--layout-header-bg)]/10" />
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)" }}>
        <div className="h-9 w-full" style={{ backgroundColor: "var(--layout-header-bg, #1a1a1a)" }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3" style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8f8fc" }}>
            <Skeleton className="h-3.5 w-20 rounded bg-[var(--layout-header-bg)]/10" />
            <Skeleton className="h-3.5 w-32 rounded bg-[var(--layout-header-bg)]/10" />
            <Skeleton className="h-3.5 w-24 rounded bg-[var(--layout-header-bg)]/10" />
            <Skeleton className="h-4 w-4 rounded-full bg-[var(--layout-header-bg)]/10 ml-auto" />
            <Skeleton className="h-5 w-14 rounded-full bg-[var(--layout-header-bg)]/10" />
            <Skeleton className="h-4 w-4 rounded bg-[var(--layout-header-bg)]/10" />
            <Skeleton className="h-5 w-10 rounded-full bg-[var(--layout-header-bg)]/10" />
            <Skeleton className="h-4 w-4 rounded bg-[var(--layout-header-bg)]/10" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in space-y-6">
      {/* Form Card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 12%, var(--layout-page-bg, #ffffff) 88%)", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
        {/* Form Header */}
        <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent)" }}>
            <UserPlus size={20} style={{ color: "var(--layout-icon-color, #888888)" }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              {editingId ? "Editar Apresentador/Participante" : "Novo Apresentador/Participante"}
            </h3>
            <p className="text-[11px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Preencha os dados abaixo para cadastrar</p>
          </div>
        </div>

        {/* Form Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Categoria */}
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Categoria</label>
              <Select value={categoria} onValueChange={setCategoria} open={catOpen} onOpenChange={setCatOpen}>
                <SelectTrigger className="w-full h-9" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 60%, transparent)", color: "var(--layout-page-text, #1a1a1a)", borderRadius: "12px", border: catOpen ? "1px solid var(--layout-accent-color, #2563eb)" : "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)", transition: "border-color 0.3s" }}>
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
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nome Completo</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Digite o nome completo"
                className="w-full px-4 py-2 outline-none transition-all text-sm placeholder:text-[color-mix(in_srgb,var(--layout-page-text)_40%,transparent)]"
                style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 60%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)", borderRadius: "12px", color: "var(--layout-page-text, #1a1a1a)" }}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.8)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.6)"; }}
              />
            </div>
          </div>

          {categoria === "Convidado" && (
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Cargo</label>
              <input value={cargoConvidado} onChange={(e) => setCargoConvidado(e.target.value)} placeholder="Ex: Médico, Advogado..."
                className="w-full px-4 py-2 outline-none transition-all text-sm placeholder:text-[color-mix(in_srgb,var(--layout-page-text)_40%,transparent)]"
                style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 60%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)", borderRadius: "12px", color: "var(--layout-page-text, #1a1a1a)" }}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.8)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.6)"; }}
              />
            </div>
          )}

          {/* Instagram + WhatsApp */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Instagram</label>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)" }}>
                  <Instagram size={16} className="text-white" />
                </div>
                <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario_instagram"
                  className="flex-1 px-4 py-2 outline-none transition-all text-sm placeholder:text-[color-mix(in_srgb,var(--layout-page-text)_40%,transparent)]"
                  style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 60%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)", borderRadius: "12px", color: "var(--layout-page-text, #1a1a1a)" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.8)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.6)"; }}
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>WhatsApp</label>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#25D366" }}>
                  <Phone size={16} className="text-white" />
                </div>
                <input value={whatsapp} onChange={(e) => setWhatsapp(formatWhatsapp(e.target.value))} placeholder="+55 (DDD) 00000-0000"
                  className="flex-1 px-4 py-2 outline-none transition-all text-sm placeholder:text-[color-mix(in_srgb,var(--layout-page-text)_40%,transparent)]"
                  style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 60%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)", borderRadius: "12px", color: "var(--layout-page-text, #1a1a1a)" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.8)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.6)"; }}
                />
              </div>
            </div>
          </div>

          {/* Foto */}
          {showFoto && (
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                Foto (1080 × 1080 px — PNG com fundo transparente)
              </label>
              <div className="flex items-start gap-4">
                <label className="cursor-pointer group">
                  <div className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all group-hover:border-[var(--layout-accent-color)]"
                    style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 50%, transparent)", border: "2px dashed color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
                    {foto ? (
                      <img src={foto} alt="Preview" className="w-full h-full object-cover rounded-2xl" />
                    ) : (
                      <>
                        <Camera size={20} style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 30%, transparent)" }} className="group-hover:text-[var(--layout-accent-color)] transition-colors" />
                        <span className="text-[9px] group-hover:text-[var(--layout-accent-color)]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Upload</span>
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
          <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div className="relative">
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 rounded-full transition-colors peer-checked:bg-[var(--layout-accent-color)]" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)" }} />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-sm" />
              </div>
              <span className="text-xs font-medium" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{ativo ? "Ativo" : "Inativo"}</span>
            </label>

            <div className="flex gap-2">
              {editingId && (
                <button onClick={resetForm}
                  className="px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5 rounded-xl"
                  style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)" }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)"; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)"; }}
                >
                  <X size={13} /> Cancelar
                </button>
              )}
              <button onClick={handleSave} disabled={saving}
                className="px-6 py-2.5 text-xs font-bold transition-all duration-300 flex items-center gap-2 disabled:opacity-50 rounded-full hover:scale-[1.03] active:scale-[0.97]"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  color: "var(--layout-accent-color, #2563eb)",
                  border: "1.5px solid rgba(255,255,255,0.18)",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.22)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.15)"; }}
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {saving ? "Salvando..." : editingId ? "Atualizar" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Import Excel + Stats Bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <label className="cursor-pointer flex items-center gap-2 px-5 py-2 rounded-full text-[11px] font-semibold transition-all duration-300 hover:scale-[1.03] active:scale-[0.97]"
          style={{
            background: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            color: "var(--layout-accent-color, #2563eb)",
            border: "1.5px solid rgba(255,255,255,0.18)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
          onMouseEnter={(e: any) => { e.currentTarget.style.background = "rgba(255,255,255,0.22)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2)"; }}
          onMouseLeave={(e: any) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.15)"; }}
        >
          <FileSpreadsheet size={14} />
          Importar Excel
          <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelFile} className="hidden" />
        </label>

        {!loadingList && apresentadores.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)" }}>
              <Shield size={13} style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
              <span className="text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{stats.total} cadastrados</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ backgroundColor: "rgba(34,197,94,0.08)" }}>
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[11px] font-medium text-green-700">{stats.ativos} ativos</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ backgroundColor: "rgba(220,38,38,0.06)" }}>
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span className="text-[11px] font-medium text-red-600">{stats.inativos} inativos</span>
            </div>
          </>
        )}
      </div>

      {/* Table */}
      {loadingList ? listSkeleton : apresentadores.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Cadastrados</h4>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--layout-header-text, #ffffff)", opacity: 0.6 }} />
                <input
                  type="text"
                  value={searchNome}
                  onChange={(e) => setSearchNome(e.target.value)}
                  placeholder="Buscar nome..."
                  className="pl-8 pr-3 text-xs outline-none"
                  style={{ backgroundColor: "var(--layout-header-bg, #1a1a1a)", color: "var(--layout-header-text, #ffffff)", borderRadius: "12px", border: "none", fontSize: "12px", height: "30px", width: "180px" }}
                />
              </div>
              <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                <SelectTrigger className="w-[160px]" style={{ backgroundColor: "var(--layout-header-bg, #1a1a1a)", color: "var(--layout-header-text, #ffffff)", borderRadius: "12px", border: "none", fontSize: "12px", height: "30px", padding: "0 12px" }}>
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
          </div>

          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <table className="w-full text-xs" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              <thead>
                <tr style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", color: "var(--layout-header-text, #ffffff)" }}>
                  <th className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider">Categoria</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider">Nome</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider">Redes / Contato</th>
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
                          backgroundColor: a.cargo === "Apresentador" ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)" : a.cargo === "Jornalista" ? "rgba(45,191,244,0.1)" : "rgba(251,216,55,0.15)",
                          color: a.cargo === "Apresentador" ? "var(--layout-accent-color, #2563eb)" : a.cargo === "Jornalista" ? "#0e9bc0" : "#b8860b",
                        }}
                      >
                        {a.cargo || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-semibold">{a.nome}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        {a.instagram ? (
                          <span className="flex items-center gap-1.5 text-[11px]"><Instagram size={12} style={{ color: "#e1306c" }} /> {a.instagram}</span>
                        ) : null}
                        {a.whatsapp ? (
                          <span className="flex items-center gap-1.5 text-[11px]"><Phone size={12} style={{ color: "#25D366" }} /> {a.whatsapp}</span>
                        ) : null}
                        {!a.instagram && !a.whatsapp && <span className="text-[var(--layout-page-text)]/25">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {a.foto ? <CheckCircle size={15} className="inline" style={{ color: "#22c55e" }} /> : <span className="text-[var(--layout-page-text)]/20">—</span>}
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
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--layout-accent-color)]/10">
                          <Pencil size={13} style={{ color: "var(--layout-icon-color, #888888)" }} />
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

      {/* Import Confirmation Popup */}
      {importRows && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="animate-fade-in p-6 text-center space-y-4"
            style={{ width: "420px", background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", borderRadius: "20px", boxShadow: "0 20px 60px color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
            <FileSpreadsheet size={36} style={{ color: "var(--layout-accent-color, #2563eb)", margin: "0 auto" }} />
            <p className="text-white text-sm font-semibold">
              Deseja importar <span style={{ color: "var(--layout-accent-color, #2563eb)" }}>{importRows.length}</span> participante{importRows.length > 1 ? "s" : ""} para o banco de dados?
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button onClick={() => setImportRows(null)} disabled={importing}
                className="px-5 py-2 rounded-xl text-xs font-bold transition-all"
                style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}>
                Cancelar
              </button>
              <button onClick={confirmImport} disabled={importing}
                className="btn-skyglass-accent px-5 py-2 text-xs">
                {importing && <Loader2 size={13} className="animate-spin" />}
                {importing ? "Importando..." : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
          <div className="flex flex-col items-center justify-center animate-fade-in overflow-hidden"
            style={{ width: "450px", height: "165px", background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", borderRadius: "20px", boxShadow: "0 20px 60px color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
            <div className="flex items-center gap-3 flex-1 justify-center" style={{ fontSize: "14px", color: "var(--layout-header-text, #ffffff)", fontWeight: 600 }}>
              <CheckCircle size={22} style={{ color: "var(--layout-accent-color, #2563eb)" }} /> Salvo com sucesso!
            </div>
            <div className="w-full" style={{ height: "4px", backgroundColor: "rgba(255,255,255,0.1)" }}>
              <div style={{ height: "100%", background: "linear-gradient(90deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", animation: "shrinkBar 2s linear forwards" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
