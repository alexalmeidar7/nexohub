import { useState, useEffect, useRef } from "react";
import { scrollToForm } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getSnapshotTable, getSnapshotProgramas, getSnapshotTestemunhais } from "@/lib/supabaseDatabaseSnapshot";
import { findClientAccountById, findClientAccountByEmail, POSITIVA_USER_ID, POSITIVA_TESTEMUNHAIS_IDS, isPositivaStationAccount } from "@/lib/clientAuthAccounts";
import { Loader2, Trash2, Pencil, Save, X, MessageSquareQuote, Calendar, Check, Bold, Italic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { confirmDialog } from "@/lib/confirmDialog";
import LazyRichTextEditor from "./LazyRichTextEditor";
import DOMPurify from 'dompurify';

const CYAN = "#0055ff";
const LIME = "#0055ff";
const CARD_BG = "#ffffff";
const DARK = "#002132";
const FONT = "'Montserrat', sans-serif";

interface Testemunhal {
  id: string;
  texto: string;
  data_inicio: string;
  data_fim: string;
  programa_id?: string | null;
  programa_ids?: string[] | null;
}

const getLinkedProgramIds = (item: Pick<Testemunhal, "programa_id" | "programa_ids">) => {
  const currentIds = Array.isArray(item.programa_ids)
    ? item.programa_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  // programa_ids is the current source of truth. programa_id only supports legacy rows
  // that were created before the multi-program field existed.
  return currentIds.length > 0
    ? Array.from(new Set(currentIds))
    : item.programa_id
      ? [item.programa_id]
      : [];
};

const pillInput: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 999,
  background: "#f8fafc",
  border: "1px solid rgba(226, 232, 240, 0.9)",
  padding: "0 20px",
  fontFamily: FONT,
  fontSize: 12,
  color: "#0f172a",
  outline: "none",
  textTransform: "uppercase",
};

const labelStyle: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 6,
  display: "block",
};

const cardStyle: React.CSSProperties = {
  background: CARD_BG,
  borderRadius: 24,
  padding: 24,
  fontFamily: FONT,
};

const primaryBtn: React.CSSProperties = {
  height: 44,
  borderRadius: 999,
  background: "#0055ff",
  color: "#fff",
  padding: "0 24px",
  fontFamily: FONT,
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "none",
  cursor: "pointer",
  boxShadow: "0 4px 14px rgba(0, 85, 255, 0.25)",
};

const limeBtn: React.CSSProperties = { ...primaryBtn };
const ghostBtn: React.CSSProperties = {
  ...primaryBtn,
  background: "#f8fafc",
  color: "#334155",
  border: "1px solid #cbd5e1",
  boxShadow: "none",
};

export default function TestemunhaisPage({ effectiveUserId }: { effectiveUserId?: string | null }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Testemunhal[]>([]);
  const [programas, setProgramas] = useState<{ id: string; nome: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [showProgramCombo, setShowProgramCombo] = useState(false);
  const [form, setForm] = useState({
    texto: "",
    data_inicio: new Date().toISOString().split("T")[0],
    data_fim: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    programa_ids: [] as string[],
  });

  const clientAcc = (effectiveUserId && findClientAccountById(effectiveUserId)) ||
                    (user?.id && findClientAccountById(user.id)) ||
                    (user?.email && findClientAccountByEmail(user.email));
  const ownerId = effectiveUserId || clientAcc?.parentUserId || clientAcc?.id || user?.id;
  const ownerSlug = clientAcc?.slug || (user as any)?.user_metadata?.slug || "";
  const isPositivaStation = isPositivaStationAccount(ownerId) || isPositivaStationAccount(ownerSlug);

  const getLocalStorageKey = (uId: string) => `nexohub_testemunhais_${uId}`;

  const getStoredTestemunhais = (uId: string): Testemunhal[] => {
    try {
      const raw = localStorage.getItem(getLocalStorageKey(uId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          if (!isPositivaStation) {
            const cleaned = parsed.filter((t: any) =>
              t.user_id !== POSITIVA_USER_ID && !POSITIVA_TESTEMUNHAIS_IDS.has(t.id)
            );
            if (cleaned.length !== parsed.length) {
              localStorage.setItem(getLocalStorageKey(uId), JSON.stringify(cleaned));
            }
            return cleaned;
          }
          return parsed;
        }
      }
    } catch {}
    return [];
  };

  const saveStoredTestemunhais = (uId: string, list: Testemunhal[]) => {
    try {
      const toSave = isPositivaStation
        ? list
        : list.filter((t: any) => t.user_id !== POSITIVA_USER_ID && !POSITIVA_TESTEMUNHAIS_IDS.has(t.id));
      localStorage.setItem(getLocalStorageKey(uId), JSON.stringify(toSave));
    } catch {}
  };

  const loadData = async () => {
    if (!ownerId) {
      setLoading(false);
      return;
    }
    const cachedItems = getStoredTestemunhais(ownerId).filter((t: any) =>
      isPositivaStation || (t.user_id !== POSITIVA_USER_ID && !POSITIVA_TESTEMUNHAIS_IDS.has(t.id))
    );
    if (cachedItems.length > 0) {
      setItems(cachedItems);
      setLoading(false);
    } else {
      setLoading(true);
    }

    let tList: Testemunhal[] = [];
    let pList: { id: string; nome: string }[] = [];

    try {
      const [{ data: tData }, { data: directPrograms }] = await Promise.all([
        supabase.from("testemunhais").select("*").eq("user_id", ownerId).order("created_at", { ascending: false }),
        supabase.from("programas").select("id, nome").eq("user_id", ownerId).order("nome"),
      ]);
      if (tData) {
        tList = tData.map(t => ({
          ...t,
          texto: t.texto || "",
        })) as Testemunhal[];
      }
      if (directPrograms?.length) pList = directPrograms;
    } catch (e) {
      console.warn("Error loading testemunhais/programas:", e);
    }

    if (tList.length === 0 || pList.length === 0) {
      try {
        const targetSlugOrId = ownerSlug || ownerId;
        if (targetSlugOrId) {
          const { data: edgeData } = await supabase.functions.invoke("public-promo-data", {
            body: { slug: targetSlugOrId }
          });
          if (tList.length === 0 && edgeData?.testemunhais?.length > 0) {
            const validTests = edgeData.testemunhais.filter((t: any) =>
              t.user_id === ownerId || (isPositivaStation && t.user_id === POSITIVA_USER_ID)
            );
            if (validTests.length > 0) {
              tList = validTests.map((t: any) => ({
                ...t,
                texto: t.texto || "",
              })) as Testemunhal[];
            }
          }
          if (pList.length === 0 && edgeData?.programas?.length > 0) {
            const validProgs = edgeData.programas.filter((p: any) =>
              p.user_id === ownerId || (isPositivaStation && p.user_id === POSITIVA_USER_ID)
            );
            if (validProgs.length > 0) {
              pList = validProgs.map((p: any) => ({ id: p.id, nome: p.nome }));
            }
          }
        }
      } catch {}
    }

    if (tList.length === 0) {
      const snapTests = getSnapshotTestemunhais(ownerSlug || ownerId);
      if (snapTests && snapTests.length > 0) {
        tList = snapTests.map((t: any) => ({
          ...t,
          texto: t.texto || "",
        })) as Testemunhal[];
      }
    }

    if (pList.length === 0) {
      const snapProgs = getSnapshotProgramas(ownerSlug || ownerId);
      if (snapProgs && snapProgs.length > 0) {
        pList = snapProgs.map((p: any) => ({ id: p.id, nome: p.nome }));
      }
    }

    // Merge Supabase items with local storage items
    const localList = getStoredTestemunhais(ownerId);
    const map = new Map<string, Testemunhal>();
    tList.forEach(t => map.set(t.id, t));
    localList.forEach(t => map.set(t.id, t));
    let merged = Array.from(map.values());
    if (!isPositivaStation) {
      merged = merged.filter((t: any) => t.user_id !== POSITIVA_USER_ID && !POSITIVA_TESTEMUNHAIS_IDS.has(t.id));
    }

    setProgramas(pList);
    setItems(merged);
    saveStoredTestemunhais(ownerId, merged);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [ownerId, ownerSlug, user?.email]);

  const reset = () => {
    setForm({
      texto: "",
      data_inicio: new Date().toISOString().split("T")[0],
      data_fim: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      programa_ids: [],
    });
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!ownerId) return;
    const cleanText = form.texto.replace(/<[^>]*>/g, "").trim();
    if (!cleanText && !form.texto.trim()) {
      toast({ title: "O texto da citação é obrigatório", variant: "destructive" });
      return;
    }

    setSaving(true);
    const id = editingId || `test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const newEntry: Testemunhal = {
      id,
      texto: form.texto.trim(),
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      programa_ids: form.programa_ids,
      programa_id: form.programa_ids[0] ?? null,
    };

    // Update local state and localStorage immediately
    const existingList = getStoredTestemunhais(ownerId);
    const map = new Map<string, Testemunhal>();
    items.forEach(i => map.set(i.id, i));
    existingList.forEach(i => map.set(i.id, i));
    map.set(id, newEntry);

    const updatedList = editingId
      ? Array.from(map.values()).map(i => i.id === editingId ? newEntry : i)
      : [newEntry, ...Array.from(map.values()).filter(i => i.id !== id)];

    setItems(updatedList);
    saveStoredTestemunhais(ownerId, updatedList);

    // Sync to Supabase in the background if valid UUID
    const isUuid = (val: any) => typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const validProgId = isUuid(form.programa_ids[0]) ? form.programa_ids[0] : null;
    const validProgIds = form.programa_ids.filter(isUuid);

    const payload: any = {
      user_id: ownerId,
      texto: form.texto.trim(),
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      programa_ids: validProgIds,
      programa_id: validProgId,
      updated_at: new Date().toISOString(),
    };

    let saveError: string | null = null;
    try {
      if (editingId && isUuid(editingId)) {
        const { data, error } = await supabase.from("testemunhais").update(payload).eq("id", editingId).select("id");
        if (error) saveError = error.message;
        else if (!data || data.length === 0) saveError = "Nenhum registro foi atualizado (sessão expirada ou sem permissão).";
      } else if (!editingId && isUuid(ownerId)) {
        const insertPayload = isUuid(id) ? { id, ...payload } : payload;
        const { data, error } = await supabase.from("testemunhais").insert([insertPayload]).select();
        if (error) {
          saveError = error.message;
        } else if (data?.[0]?.id && data[0].id !== id) {
          const remoteId = data[0].id;
          const finalizedList = updatedList.map(item => item.id === id ? { ...item, id: remoteId } : item);
          setItems(finalizedList);
          saveStoredTestemunhais(ownerId, finalizedList);
        }
      }
    } catch (e: any) {
      saveError = e?.message || String(e);
    } finally {
      setSaving(false);
      if (saveError) {
        // Do not discard the draft or report a successful save when the database rejected it.
        setItems(items);
        saveStoredTestemunhais(ownerId, items);
        toast({ title: "Erro ao salvar citação no banco", description: saveError, variant: "destructive" });
      } else {
        toast({ title: editingId ? "Citação atualizada com sucesso" : "Citação cadastrada com sucesso" });
        reset();
      }
    }
  };

  const handleEdit = (item: Testemunhal) => {
    const itemProgIds = getLinkedProgramIds(item);

    setEditingId(item.id);
    setForm({
      texto: item.texto || "",
      data_inicio: item.data_inicio,
      data_fim: item.data_fim,
      programa_ids: itemProgIds,
    });
    setShowProgramCombo(false);
    scrollToForm(formRef.current);
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDialog({
      title: "Excluir Citação",
      message: "Tem certeza que deseja excluir esta citação?",
      confirmLabel: "Excluir",
      destructive: true
    });
    if (!confirmed || !ownerId) return;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    try {
      if (isUuid) {
        const { data, error } = await supabase.from("testemunhais").delete()
          .eq("id", id).eq("user_id", ownerId).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("O banco não confirmou a exclusão da citação.");
      }
      const updated = items.filter(item => item.id !== id);
      setItems(updated);
      saveStoredTestemunhais(ownerId, updated);
      toast({ title: "Citação excluída" });
    } catch (e: any) {
      console.error("Erro ao excluir citação:", e);
      toast({ title: "Citação não foi excluída", description: e?.message || "Falha ao excluir no servidor.", variant: "destructive" });
    }
  };

  if (loading) return <ModulePageSkeleton variant="form" />;

  return (
    <div className="nexo-scope space-y-6 w-full max-w-none mx-0" style={{ fontFamily: FONT }}>
      <div id="module-header-title" style={{ display: "none" }}>ADS — Citações</div>

      <style>{`
        .nexo-quill-editor .ql-container {
          border-bottom-left-radius: 24px;
          border-bottom-right-radius: 24px;
          background: #FFFFFF;
          font-family: ${FONT};
          min-height: 200px;
        }
        .nexo-quill-editor .ql-toolbar {
          border-top-left-radius: 24px;
          border-top-right-radius: 24px;
          background: #FFFFFF;
          border-bottom: 1px solid ${CYAN}33;
        }
        .nexo-quill-editor .ql-editor {
          font-size: 14px;
          line-height: 1.6;
        }
      `}</style>

      <div ref={formRef} style={cardStyle} className="mb-6">
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
            {editingId ? "Editar Citação" : "Cadastro de Citação"}
          </h3>
          <div className="text-[11px] font-bold text-slate-600 bg-slate-100/90 px-4 py-2 rounded-full uppercase tracking-wider border border-slate-200/80 shadow-xs flex items-center gap-1.5">
            <span className="text-slate-400 font-semibold">ID:</span>
            <span className="text-[#0055ff] font-black">{editingId ? editingId.slice(0, 8) : "—"}</span>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="relative">
            <label style={labelStyle}>Programas (Selecione um ou mais)</label>
            <button
              type="button"
              onClick={() => setShowProgramCombo(!showProgramCombo)}
              style={{ ...pillInput, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <span className="truncate font-semibold">
                {form.programa_ids.length === 0 
                  ? "Selecione os programas..." 
                  : `${form.programa_ids.length} programa(s) selecionado(s)`}
              </span>
              <span className="text-[#0055ff] ml-2">▼</span>
            </button>

            {form.programa_ids.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {form.programa_ids.map(pid => {
                  const prog = programas.find(p => p.id === pid);
                  return (
                    <span
                      key={pid}
                      className="inline-flex items-center gap-2 bg-[#0055ff] text-white text-[11px] font-bold uppercase tracking-wide px-3.5 py-1.5 rounded-full shadow-md"
                    >
                      <Check size={12} className="text-white" />
                      {prog?.nome || "Programa"}
                      <button
                        type="button"
                        onClick={() => setForm(current => ({ ...current, programa_ids: current.programa_ids.filter(id => id !== pid) }))}
                        className="text-white/70 hover:text-white transition-colors"
                        aria-label={`Remover ${prog?.nome || "programa"}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            
            {showProgramCombo && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowProgramCombo(false)}
                />
                <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-3xl p-2 z-20 max-h-72 overflow-y-auto shadow-2xl space-y-1">
                  {programas.map(p => {
                    const selected = form.programa_ids.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setForm(current => ({
                            ...current,
                            programa_ids: current.programa_ids.includes(p.id)
                              ? current.programa_ids.filter(id => id !== p.id)
                              : [...current.programa_ids, p.id],
                          }));
                        }}
                        className={`w-full text-left px-4 py-2.5 rounded-full flex items-center justify-between gap-3 transition-all ${selected ? 'bg-[#0055ff] text-white shadow-md' : 'bg-slate-50 hover:bg-[#0055ff] hover:text-white text-slate-700'}`}
                      >
                        <span className="text-xs font-bold uppercase tracking-wide truncate">{p.nome}</span>
                        <span
                          className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center border ${selected ? 'bg-white border-white' : 'border-slate-300'}`}
                        >
                          {selected && <Check size={12} className="text-[#0055ff]" />}
                        </span>
                      </button>
                    );
                  })}
                  {programas.length === 0 && (
                    <div className="p-4 text-center text-slate-400 text-xs italic">
                      Nenhum programa cadastrado
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Data Início</label>
              <input type="date" style={pillInput} value={form.data_inicio} onChange={(e) => setForm(current => ({ ...current, data_inicio: e.target.value }))}/>
            </div>
            <div>
              <label style={labelStyle}>Data Fim (Validade)</label>
              <input type="date" style={pillInput} value={form.data_fim} onChange={(e) => setForm(current => ({ ...current, data_fim: e.target.value }))}/>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Texto da Citação</label>
            <div className="nexo-quill-editor overflow-hidden rounded-[24px] border-2 border-[#0055ff] shadow-xs">
              <LazyRichTextEditor
                                theme="snow"
                value={form.texto}
                onChange={(content) => setForm(current => ({ ...current, texto: content }))}
                modules={{
                  toolbar: [
                    ['bold', 'italic'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    ['clean']
                  ],
                }}
                placeholder="Digite o conteúdo da citação..."
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button style={limeBtn} onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {editingId ? "Atualizar" : "Cadastrar Citação"}
            </button>
            {editingId && <button style={ghostBtn} onClick={reset}><X size={16} /> Cancelar</button>}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Calendar className="text-[#0055ff]" /> Citações Cadastradas ({items.length})
        </h2>
        
        {items.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200"><p className="text-sm text-slate-400">Nenhuma citação cadastrada.</p></div>
        ) : (
          <div className="overflow-x-auto rounded-[24px] border border-slate-200/90 shadow-sm">
            <table className="w-full text-left border-collapse bg-white">
              <thead>
                <tr style={{ backgroundColor: CYAN }}>
                  <th className="p-4 text-[11px] uppercase font-black tracking-wider text-white border-r border-white/10">Programa</th>
                  <th className="p-4 text-[11px] uppercase font-black tracking-wider text-white border-r border-white/10">Citação</th>
                  <th className="p-4 text-[11px] uppercase font-black tracking-wider text-white border-r border-white/10">Validade</th>
                  <th className="p-4 text-[11px] uppercase font-black tracking-wider text-white">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr 
                    key={item.id} 
                    className="transition-colors hover:bg-slate-50/60"
                    style={{ backgroundColor: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC" }}
                  >
                    <td className="p-4 text-[11px] text-[#0A2540] border-r border-slate-100">
                      <div className="flex flex-wrap gap-1">
                        {getLinkedProgramIds(item).length > 0 ? (
                          getLinkedProgramIds(item).map(pid => {
                            const prog = programas.find(p => p.id === pid || String(p.id).toLowerCase() === String(pid).toLowerCase())
                              || getSnapshotProgramas(ownerSlug || ownerId).find((p: any) => p.id === pid || String(p.id).toLowerCase() === String(pid).toLowerCase());
                            return (
                              <span key={pid} className="bg-[#0055ff]/10 text-[#0055ff] border border-[#0055ff]/20 px-2.5 py-0.5 rounded-full font-bold text-[10px]">
                                {prog ? prog.nome : pid}
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-slate-400 italic">Nenhum</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-[13px] text-[#0A2540] border-r border-slate-100">
                      <div 
                        className="max-w-xs truncate line-clamp-2" 
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.texto) }}
                      />
                    </td>
                    <td className="p-4 text-[11px] font-bold text-slate-500 whitespace-nowrap border-r border-slate-100">
                      {new Date(item.data_fim + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1.5 items-center">
                        <button 
                          type="button"
                          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-[#0055ff]/10 text-slate-500 hover:text-[#0055ff] flex items-center justify-center transition-all cursor-pointer"
                          onClick={() => handleEdit(item)}
                          title="Editar"
                        >
                          <Pencil size={14}/>
                        </button>
                        <button 
                          type="button"
                          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 flex items-center justify-center transition-all cursor-pointer"
                          onClick={() => handleDelete(item.id)}
                          title="Excluir"
                        >
                          <Trash2 size={14}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
