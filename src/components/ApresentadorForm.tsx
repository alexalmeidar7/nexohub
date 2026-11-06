import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Instagram, UserCheck, UserX, Trash2, Pencil, X, Loader2, UserPlus, Camera, Shield, Phone, FileSpreadsheet, Search, Save, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uploadImageToStorage } from "@/lib/uploadImageToStorage";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";

export interface Apresentador {
  id: string;
  nome: string;
  cargo: string;
  categoria?: string;
  instagram: string;
  whatsapp: string;
  foto: string;
  background_url?: string | null;
  ativo: boolean;
  persisted?: boolean;
}

export function mergeApresentadorSources(
  defaults: Apresentador[],
  local: Apresentador[],
  persisted: Apresentador[],
): Apresentador[] {
  const merged: Apresentador[] = [];

  for (const source of [defaults, local, persisted]) {
    for (const participante of source) {
      const nomeKey = participante.nome.trim().toLowerCase();
      const existingIndex = merged.findIndex(existing =>
        existing.id === participante.id ||
        (!!nomeKey && existing.nome.trim().toLowerCase() === nomeKey)
      );

      if (existingIndex < 0) {
        merged.push(participante);
      } else {
        merged[existingIndex] = { ...merged[existingIndex], ...participante };
      }
    }
  }

  return merged;
}

export async function removeParticipantFromSource(
  participant: Apresentador,
  ownerId: string,
): Promise<{ error?: string }> {
  if (participant.persisted === true) {
    const { data, error } = await supabase.from("apresentadores")
      .delete().eq("id", participant.id).eq("user_id", ownerId).select("id, user_id");
    if (error) return { error: error.message || "Não foi possível excluir o participante." };
    if (!data?.some(row => row.id === participant.id && row.user_id === ownerId)) {
      return { error: "O banco não confirmou a exclusão do participante. Nenhum dado local foi alterado." };
    }
    return {};
  }

  try {
    const key = `nexohub_participantes_excluidos_${ownerId}`;
    const current = JSON.parse(localStorage.getItem(key) || "[]");
    const deleted = Array.isArray(current) ? current : [];
    if (!deleted.includes(participant.id)) deleted.push(participant.id);
    localStorage.setItem(key, JSON.stringify(deleted));
    return {};
  } catch {
    return { error: "Não foi possível registrar a exclusão local do participante." };
  }
}

export async function findParticipantRowForEdit(
  participant: Apresentador,
  ownerId: string,
): Promise<string | null> {
  const byId = await supabase.from("apresentadores")
    .select("id, user_id")
    .eq("id", participant.id)
    .eq("user_id", ownerId)
    .limit(1);
  if (byId.error) throw byId.error;
  const idMatch = byId.data?.find(row => row.id === participant.id && row.user_id === ownerId);
  if (idMatch) return idMatch.id;

  const byName = await supabase.from("apresentadores")
    .select("id, user_id")
    .eq("user_id", ownerId)
    .eq("nome", participant.nome)
    .limit(2);
  if (byName.error) throw byName.error;
  const matches = (byName.data || []).filter(row => row.user_id === ownerId);
  if (matches.length > 1) {
    throw new Error("Há mais de um cadastro com o mesmo nome. Atualize a lista e selecione o registro pelo ID para evitar duplicação.");
  }
  return matches[0]?.id || null;
}

export const CATEGORIA_OPTIONS = ["Apresentador", "Jornalista", "Convidado"];

export function resolveParticipanteCategoria(a: { nome?: string; cargo?: string; categoria?: string; foto?: string }): { categoria: "Apresentador" | "Jornalista" | "Convidado"; cargo: string } {
  const explicitCat = (a.categoria || "").trim();
  const explicitCargo = (a.cargo || "").trim();

  // If already explicit in standard categories
  if (CATEGORIA_OPTIONS.includes(explicitCat)) {
    return {
      categoria: explicitCat as any,
      cargo: explicitCargo && explicitCargo !== explicitCat ? explicitCargo : (explicitCat === "Convidado" ? "" : explicitCat)
    };
  }
  if (CATEGORIA_OPTIONS.includes(explicitCargo)) {
    return {
      categoria: explicitCargo as any,
      cargo: explicitCargo === "Convidado" ? "" : explicitCargo
    };
  }

  const nameUpper = (a.nome || "").trim().toUpperCase();

  // Known Journalists
  const knownJornalistas = [
    "HENRIQUE MORGANTINI", "MARCOS MARINHO", "RICARDO MARQUES",
    "LUIZ GAMA", "DOMINGOS KETELBEY", "FABIO CAMARGO", "FÁBIO CAMARGO", "JORNALISTA"
  ];
  if (knownJornalistas.some(j => nameUpper.includes(j))) {
    return { categoria: "Jornalista", cargo: explicitCargo || "Jornalista" };
  }

  // Known Apresentadores / Locutores / DJs (or anyone with an official photo in station storage)
  const knownApresentadores = [
    "GABS", "ANDRE RODRIGUES", "ANDRÉ RODRIGUES", "ANI CRISTINE", "DJ HENRIQUE AMARAL",
    "PABLO KOSSA", "JOSÉ LUIZ", "JOSE LUIZ", "THIAGO SANTHÊ", "THIAGO SANTHE",
    "HENRIQUE AUGUSTO", "JOHNNY BOTELHO", "ÉVERSON CÂNDIDO", "EVERSON CANDIDO",
    "DJ KOJAK", "TEO", "LEO MARTINE", "LÉO MARTINE", "REGYS RODRIGUES",
    "ERIKA NAVES", "ÉRIKA NAVES", "FELLIPE ROCHA", "JHONATHA", "TONINHO",
    "LOCUTOR", "APRESENTADOR", "DJ "
  ];
  const hasOfficialPhoto = Boolean(a.foto && (a.foto.includes("empresa-assets/apresentadores") || a.foto.includes("supabase.co")));

  if (hasOfficialPhoto || knownApresentadores.some(ap => nameUpper.includes(ap))) {
    return { categoria: "Apresentador", cargo: explicitCargo || (nameUpper.includes("DJ") ? "DJ / Apresentador" : "Locutor / Apresentador") };
  }

  // Default for other participants
  return { categoria: "Convidado", cargo: explicitCargo || "" };
}

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

import { fetchStationDatabaseData, getStationDatabaseSync } from "@/lib/stationDatabaseService";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";
import { normalizeClientKey } from "@/lib/houseMixProgramasService";
import { DEFAULT_STATION_PARTICIPANTES } from "@/lib/stationParticipantesData";

export async function getApresentadores(userId?: string, userEmail?: string | null): Promise<Apresentador[]> {
  const acc = findClientAccountById(userId) || findClientAccountByEmail(userEmail || userId);
  const effectiveId = acc?.parentUserId || acc?.id || userId;
  const targetSlug = acc?.slug || userId;

  let resolvedStation = normalizeClientKey(acc?.nome || acc?.slug || userEmail || userId);
  if (!resolvedStation && typeof window !== "undefined") {
    try {
      const backup = localStorage.getItem("nexohub_backup_session");
      if (backup) {
        const parsed = JSON.parse(backup);
        const email = parsed?.user?.email;
        const slug = parsed?.user?.user_metadata?.slug || parsed?.user?.user_metadata?.nome;
        resolvedStation = normalizeClientKey(slug || email);
      }
    } catch {}
  }
  if (!resolvedStation) {
    resolvedStation = "POSITIVA FM";
  }

  const defaultStationAps: Apresentador[] = (DEFAULT_STATION_PARTICIPANTES[resolvedStation] || []).map(a => ({
    id: a.id,
    nome: a.nome,
    categoria: a.categoria,
    cargo: a.cargo,
    instagram: a.instagram,
    whatsapp: a.whatsapp,
    foto: a.foto,
    ativo: a.ativo,
    persisted: false,
  }));

  // Exclusões de participantes padrão ficam registradas localmente para não reaparecerem após recarregar.
  let deletedParticipantIds = new Set<string>();
  try {
    const rawDeleted = effectiveId ? localStorage.getItem(`nexohub_participantes_excluidos_${effectiveId}`) : null;
    const parsedDeleted = rawDeleted ? JSON.parse(rawDeleted) : [];
    if (Array.isArray(parsedDeleted)) deletedParticipantIds = new Set(parsedDeleted.map(String));
  } catch {}
  const visibleDefaultAps = defaultStationAps.filter(a => !deletedParticipantIds.has(a.id));
  const validStationIds = new Set(visibleDefaultAps.map(a => a.id));
  const validStationNames = new Set(visibleDefaultAps.map(a => a.nome.trim().toLowerCase()));

  // 1. Fetch from Supabase (if online and valid)
  let supabaseAps: Apresentador[] = [];
  let supabaseReadSucceeded = false;
  if (effectiveId) {
    try {
      const { data, error } = await supabase.from("apresentadores").select("*").eq("user_id", effectiveId);
      if (error) throw error;
      supabaseReadSucceeded = true;
      if (data && data.length > 0) {
        supabaseAps = data
          .map(a => {
            const resolved = resolveParticipanteCategoria(a);
            return {
              id: a.id,
              nome: a.nome,
              categoria: (a as any).categoria || resolved.categoria,
              cargo: a.cargo || (a as any).categoria || resolved.cargo,
              instagram: a.instagram || "",
              whatsapp: (a as any).whatsapp || "",
              foto: a.foto || "",
              background_url: (a as any).background_url || "",
              ativo: a.ativo ?? true,
              persisted: true,
            };
          });
      }
    } catch {}
  }

  // 2. Check isolated localStorage for custom saved participantes / updated cargos
  let localList: Apresentador[] = [];
  try {
    if (effectiveId) {
      const raw = localStorage.getItem(`nexohub_participantes_${effectiveId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // STRICT FILTER: purge any leaked participant from other stations
          const persistedIds = new Set(supabaseAps.map(a => a.id));
          localList = parsed
            .filter(a => {
              // Só descartamos cache conhecido como persistido; UUID por si só não prova a origem.
              const cachedId = String(a?.id || "");
              if (supabaseReadSucceeded && a?.persisted === true && !persistedIds.has(cachedId)) return false;
              if (deletedParticipantIds.has(a.id)) return false;
              if ((a as any).stationKey && (a as any).stationKey !== resolvedStation) return false;
              if (validStationIds.has(a.id)) return true;
              if (a.nome && validStationNames.has(a.nome.trim().toLowerCase())) return true;
              return (a as any).stationKey === resolvedStation;
            })
            .map(a => {
              const resolved = resolveParticipanteCategoria(a);
              return {
                ...a,
                categoria: a.categoria || resolved.categoria,
                cargo: a.cargo || resolved.cargo,
                persisted: supabaseReadSucceeded
                  ? persistedIds.has(String(a?.id || ""))
                  : a?.persisted === true,
              };
            });
        }
      }
      // Persiste o cache saneado para não reapresentar UUIDs excluídos após recarregar.
      if (supabaseReadSucceeded && effectiveId) {
        try { localStorage.setItem(`nexohub_participantes_${effectiveId}`, JSON.stringify(localList)); } catch {}
      }
    }
  } catch {}

  // Persisted rows must win over potentially stale values from localStorage.
  const finalAps = mergeApresentadorSources(visibleDefaultAps, localList, supabaseAps);
  const dbIds = new Set(supabaseAps.map(a => a.id));
  const dbNames = new Set(supabaseAps.map(a => (a.nome || "").trim().toLowerCase()).filter(Boolean));
  // Final filter: mantém cadastros do banco (já isolados por user_id) e da própria emissora
  return finalAps.filter(a => {
    if (dbIds.has(a.id)) return true;
    if (a.nome && dbNames.has(a.nome.trim().toLowerCase())) return true;
    if (validStationIds.has(a.id)) return true;
    if (a.nome && validStationNames.has(a.nome.trim().toLowerCase())) return true;
    return (a as any).stationKey === resolvedStation;
  });
}

export default function ApresentadorForm({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const ownerAccount = findClientAccountById(targetUserId) || findClientAccountByEmail(user?.email);
  const ownerId = ownerAccount?.parentUserId || ownerAccount?.id || targetUserId || user?.id;
  const formRef = useRef<HTMLElement>(null);
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [cargoConvidado, setCargoConvidado] = useState("");
  const [instagram, setInstagram] = useState("");
  const [whatsapp, setWhatsapp] = useState("+55");
  const [foto, setFoto] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nome: string } | null>(null);
  const [filterCategoria, setFilterCategoria] = useState("todos");
  const [searchNome, setSearchNome] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [listVisible, setListVisible] = useState(false);
  const [visibleCount, setVisibleCount] = useState(25);
  const [catOpen, setCatOpen] = useState(false);
  const [importRows, setImportRows] = useState<any[] | null>(null);
  const [importing, setImporting] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [editingCell, setEditingCell] = useState<{ id: string, field: string } | null>(null);

  const updateField = async (id: string, field: string, value: any) => {
    if (!ownerId) {
      toast.error("Sessão inválida. Entre novamente para continuar.");
      return;
    }
    const { data, error } = await supabase.from("apresentadores")
      .update({ [field]: value }).eq("id", id).eq("user_id", ownerId).select("id");
    if (error || !data?.length) {
      toast.error(error?.message || "O banco não confirmou a atualização do participante.");
      return;
    }
    const updated = apresentadores.map(a => a.id === id ? { ...a, [field]: value } : a);
    setApresentadores(updated);
    if (ownerId) {
      try {
        localStorage.setItem(`nexohub_participantes_${ownerId}`, JSON.stringify(updated));
      } catch {}
    }
    // Dispara atualização imediata dos XMLs
    try {
      window.dispatchEvent(new CustomEvent("apresentadores-updated"));
    } catch {}
  };

  const load = async () => {
    setLoadingList(true);
    try {
      const list = await getApresentadores(targetUserId || user?.id, user?.email);
      list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      setApresentadores(list);
      setVisibleCount(Math.min(25, list.length));
    } finally {
      setLoadingList(false);
    }
  };

  // Prioriza a primeira pintura do formulário; a lista começa a carregar depois.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setListVisible(true);
      void load();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [targetUserId, user?.email]);

  // Reinicia a janela de renderização ao pesquisar ou filtrar.
  useEffect(() => {
    setVisibleCount(25);
  }, [filterCategoria, searchNome]);

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
    if (!nome.trim() || !ownerId || !categoria || saving) return;
    setSaving(true);

    try {
      // Para "Convidado" com cargo livre (Médico, Advogado...), grava o cargo digitado.
      const cargoValue = categoria === "Convidado" && cargoConvidado.trim()
        ? cargoConvidado.trim()
        : (cargoConvidado.trim() || categoria);

      // O upload precisa terminar antes de gravar a URL no cadastro.
      let fotoUrl = showFoto ? foto : "";
      if (fotoUrl.startsWith("data:")) {
        const targetId = editingId || crypto.randomUUID();
        fotoUrl = await uploadImageToStorage(fotoUrl, "empresa-assets", `${ownerId}/apresentadores/${targetId}.webp`);
      }

      let finalBackgroundUrl = backgroundUrl;
      if (finalBackgroundUrl.startsWith("data:")) {
        const targetId = editingId || crypto.randomUUID();
        finalBackgroundUrl = await uploadImageToStorage(finalBackgroundUrl, "empresa-assets", `${ownerId}/apresentadores/${targetId}-bg.webp`);
      }

      const payload = {
        nome: nome.trim(),
        cargo: cargoValue,
        categoria,
        instagram: instagram.trim(),
        whatsapp: whatsapp.replace(/\D/g, "").length >= 10 ? whatsapp.trim() : "",
        foto: fotoUrl,
        background_url: finalBackgroundUrl,
        ativo,
      };

      let savedId = editingId;
      const original = editingId ? apresentadores.find(a => a.id === editingId) : undefined;
      if (editingId && !original) {
        throw new Error("O participante selecionado não está mais na lista. Atualize os dados e tente novamente.");
      }

      if (editingId && original?.persisted) {
        const res = await supabase.from("apresentadores")
          .update(payload as any).eq("id", editingId).eq("user_id", ownerId).select("id, user_id");
        if (res.error) throw res.error;
        const confirmed = res.data?.find(row => row.id === editingId && row.user_id === ownerId);
        if (!confirmed) {
          throw new Error("O participante selecionado não foi localizado na emissora. Nenhum novo cadastro foi criado.");
        }
        savedId = confirmed.id;
      } else if (editingId) {
        // Confirma pelo ID primeiro, inclusive para caches antigos sem marca de origem.
        // Se o catálogo tiver outro ID, nome único identifica o registro já criado sem exigir
        // que campos editáveis (cargo/Instagram) ainda coincidam com os valores antigos.
        const matchedId = await findParticipantRowForEdit(original, ownerId);
        if (matchedId) {
          const res = await supabase.from("apresentadores")
            .update(payload as any).eq("id", matchedId).eq("user_id", ownerId).select("id, user_id");
          if (res.error) throw res.error;
          const confirmed = res.data?.find(row => row.id === matchedId && row.user_id === ownerId);
          if (!confirmed) throw new Error("O cadastro existente não pôde ser atualizado.");
          savedId = confirmed.id;
        } else {
          const ins = await supabase.from("apresentadores")
            .insert({ user_id: ownerId, ...payload } as any).select("id, user_id");
          if (ins.error) throw ins.error;
          const confirmed = ins.data?.find(row => row.id && row.user_id === ownerId);
          if (!confirmed) throw new Error("O banco não confirmou a criação do participante.");
          savedId = confirmed.id;
        }
      } else {
        const ins = await supabase.from("apresentadores")
          .insert({ user_id: ownerId, ...payload } as any).select("id, user_id");
        if (ins.error) throw ins.error;
        const confirmed = ins.data?.find(row => row.id && row.user_id === ownerId);
        if (!confirmed) throw new Error("O banco não confirmou a criação do participante.");
        savedId = confirmed.id;
      }

      const newEntry: Apresentador = {
        id: savedId || `part_${Date.now()}`,
        nome: payload.nome,
        categoria: payload.categoria,
        cargo: payload.cargo,
        instagram: payload.instagram,
        whatsapp: payload.whatsapp,
        foto: payload.foto,
        background_url: payload.background_url,
        ativo: payload.ativo,
        persisted: true,
      };
      const updated = editingId
        ? apresentadores
            .filter(a => a.id === editingId || a.id !== newEntry.id)
            .map(a => a.id === editingId ? newEntry : a)
        : [newEntry, ...apresentadores.filter(a => a.id !== newEntry.id)];
      setApresentadores(updated);
      try { localStorage.setItem(`nexohub_participantes_${ownerId}`, JSON.stringify(updated)); } catch {}
      try { window.dispatchEvent(new CustomEvent("apresentadores-updated")); } catch {}

      resetForm();
      toast.success("Salvei");
      // Atualiza a lista em segundo plano; não prende o botão ao carregamento da tabela.
      void load();
    } catch (err: any) {
      console.error("Erro ao salvar apresentador:", err);
      const message = String(err?.message || err || "erro inesperado");
      if (err?.code === "42501" || /row-level security|permission denied|violates row-level security/i.test(message)) {
        toast.error("Sem permissão para salvar este cadastro. Verifique o acesso da emissora.");
      } else if (err?.code === "401" || /jwt expired|invalid jwt|token is expired/i.test(message)) {
        toast.error("Sua sessão expirou. Entre novamente para continuar.");
      } else {
        toast.error(`Não foi possível atualizar o participante: ${message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (a: Apresentador) => {
    setEditingId(a.id);
    setNome(a.nome);
    const resolved = resolveParticipanteCategoria(a);
    const effectiveCat = a.categoria || resolved.categoria;
    setCategoria(effectiveCat);
    if (effectiveCat === "Convidado") {
      setCargoConvidado(a.cargo && a.cargo !== "Convidado" ? a.cargo : "");
    } else {
      setCargoConvidado(a.cargo && a.cargo !== effectiveCat ? a.cargo : "");
    }
    setInstagram(a.instagram);
    setWhatsapp(a.whatsapp || "+55");
    setFoto(a.foto);
    setBackgroundUrl(a.background_url || "");
    setAtivo(a.ativo);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    if (!ownerId) { toast.error("Sessão inválida."); return; }
    const { data, error } = await supabase.from("apresentadores")
      .update({ ativo: !current }).eq("id", id).eq("user_id", ownerId).select("id");
    if (error || !data?.length) {
      toast.error(error?.message || "O banco não confirmou a alteração de status.");
      return;
    }
    const updated = apresentadores.map(a => a.id === id ? { ...a, ativo: !current } : a);
    setApresentadores(updated);
    if (ownerId) {
      try {
        localStorage.setItem(`nexohub_participantes_${ownerId}`, JSON.stringify(updated));
      } catch {}
    }
  };

  const removeApresentador = async (id: string) => {
    if (!ownerId) { toast.error("Sessão inválida."); return; }
    const participant = apresentadores.find(a => a.id === id);
    if (!participant) {
      toast.error("O participante não está mais na lista. Atualize os dados e tente novamente.");
      return;
    }

    const result = await removeParticipantFromSource(participant, ownerId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    const updated = apresentadores.filter(a => a.id !== id);
    setApresentadores(updated);
    if (ownerId) {
      try { localStorage.setItem(`nexohub_participantes_${ownerId}`, JSON.stringify(updated)); } catch {}
    }
    try { window.dispatchEvent(new CustomEvent("apresentadores-updated")); } catch {}
  };

  const handleExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const XLSX = await import("xlsx");
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
    if (!importRows || !ownerId) return;
    setImporting(true);
    const inserts = importRows.map(r => ({
      user_id: ownerId,
      nome: r.nome,
      cargo: CATEGORIA_OPTIONS.includes(r.categoria) ? r.categoria : (r.cargo || "Convidado"),
      instagram: r.instagram,
      whatsapp: r.whatsapp,
      foto: "",
      ativo: r.ativo,
    }));
    try {
      const { data, error } = await supabase.from("apresentadores").insert(inserts as any).select("*");
      if (error) throw error;
      if (!data || data.length !== inserts.length) throw new Error("O banco não confirmou todos os participantes importados.");
      const importedParticipants = (data as Apresentador[]).map(participant => ({
        ...participant,
        persisted: true,
      }));
      const updated = [...importedParticipants, ...apresentadores];
      setApresentadores(updated);
      localStorage.setItem(`nexohub_participantes_${ownerId}`, JSON.stringify(updated));
      setImportRows(null);
      toast.success("Salvei");
    } catch (error: any) {
      console.error("Falha ao importar participantes:", error);
      toast.error(error?.message || "Não foi possível importar os participantes.");
    } finally {
      setImporting(false);
    }
  };

  const filtered = apresentadores
    .filter(a => {
      const cat = a.categoria || resolveParticipanteCategoria(a).categoria;
      return filterCategoria === "todos" || cat === filterCategoria;
    })
    .filter(a => !searchNome || a.nome.toLowerCase().includes(searchNome.toLowerCase()));

  const stats = {
    total: apresentadores.length,
    ativos: apresentadores.filter(a => a.ativo).length,
    inativos: apresentadores.filter(a => !a.ativo).length,
  };

  // === Nexo Form Design System (mesmo padrão Blitz / ClientesPage) ===
  const CYAN = "#0055ff";
  const LIME = "#0055ff";
  const CARD_BG = "#ffffff";
  const DARK = "#002132";

  const pillInput: React.CSSProperties = {
    width: "100%",
    height: 44,
    borderRadius: 999,
    background: "#f8fafc",
    border: "1px solid rgba(226, 232, 240, 0.9)",
    padding: "0 20px",
    fontFamily: "'Montserrat', sans-serif",
    fontSize: 12,
    color: "#0f172a",
    outline: "none",
    textTransform: "uppercase",
  };

  const pillSelect: React.CSSProperties = {
    ...pillInput,
    appearance: "none",
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%230055ff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 18px center",
    paddingRight: 44,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "'Montserrat', sans-serif",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#64748b",
    marginBottom: 6,
    display: "block",
  };

  // Field foi movido para fora do componente (ver FieldRow abaixo) para evitar
  // remontagem a cada render, o que fazia o foco sair dos inputs/combos.

  return (
    <div className="animate-fade-in space-y-8 w-full max-w-none mx-0" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <ConfirmDeleteDialog
        name={deleteTarget?.nome ?? null}
        prefix="o registro de"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) void removeApresentador(target.id);
        }}
      />
      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        Cadastro de Participantes
      </div>

      {/* FORM CARD */}
      <section
        ref={formRef}
        style={{
          background: "#ffffff",
          borderRadius: 24,
          padding: "28px 32px 32px",
          border: "1px solid rgba(226, 232, 240, 0.9)",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.03)",
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
          <div className="flex items-center gap-3">
            {/* ID Badge */}
            <div className="text-[11px] font-bold text-slate-600 bg-slate-100/90 px-4 py-2 rounded-full uppercase tracking-wider border border-slate-200/80 shadow-xs flex items-center gap-1.5">
              <span className="text-slate-400 font-semibold">ID:</span>
              <span className="text-[#0055ff] font-black">{editingId ? editingId.slice(0, 8) : "—"}</span>
            </div>

            {/* Ativo Toggle */}
            <div
              className={`flex items-center gap-2.5 px-4 py-2 rounded-full border transition-all duration-200 cursor-pointer select-none shadow-xs ${
                ativo 
                  ? "bg-emerald-50/90 border-emerald-200/90 text-emerald-800" 
                  : "bg-slate-50 border-slate-200 text-slate-600"
              }`}
              onClick={() => setAtivo(!ativo)}
            >
              <span className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${ativo ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse" : "bg-slate-400"}`} />
                {ativo ? "Ativo" : "Inativo"}
              </span>
              <Switch
                checked={ativo}
                onCheckedChange={setAtivo}
                className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-300 scale-90"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
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
                  className="group relative flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-all duration-200 rounded-2xl border-2 border-dashed border-slate-200 hover:border-[#0055ff] hover:bg-blue-50/20 bg-slate-50/80 shadow-xs"
                  style={{ width: 88, height: 88 }}
                >
                  {foto ? (
                    <div className="relative w-full h-full group">
                      <img src={foto} alt="Preview" className="w-full h-full object-cover rounded-2xl" />
                      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white rounded-2xl">
                        <Upload size={14} />
                        <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5">Trocar</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 p-1 text-slate-400 group-hover:text-[#0055ff] transition-colors">
                      <Camera size={20} className="text-slate-400 group-hover:text-[#0055ff] transition-colors" />
                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 group-hover:text-[#0055ff] transition-colors">
                        Upload
                      </span>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleFoto} style={{ display: "none" }} />
                </label>
                {foto && (
                  <button
                    type="button"
                    onClick={() => setFoto("")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/70 transition-colors shadow-xs cursor-pointer"
                  >
                    <Trash2 size={12} /> Remover foto
                  </button>
                )}
              </div>
            </div>
          )}

          {false && (
            <div className="md:col-span-2 lg:col-span-3">
              <label style={labelStyle}>Imagem de Fundo do Locutor (Modo TV / Player)</label>
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
                  {backgroundUrl ? (
                    <img src={backgroundUrl} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <>
                      <Camera size={22} style={{ color: CYAN }} />
                      <span style={{ fontSize: 9, color: DARK, marginTop: 4, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>Upload</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => setBackgroundUrl(reader.result as string);
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {backgroundUrl && (
                  <button
                    onClick={() => setBackgroundUrl("")}
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
                    Remover fundo
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
                background: "#f8fafc",
                border: "1px solid #cbd5e1",
                color: "#334155",
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
            className="h-11 px-5 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/90 text-slate-700 hover:text-slate-900 font-bold text-xs tracking-wider uppercase inline-flex items-center gap-2 cursor-pointer shadow-xs hover:shadow transition-all"
          >
            <FileSpreadsheet size={15} className="text-[#0055ff]" /> Importar Excel
            <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelFile} style={{ display: "none" }} />
          </label>
          <button
            onClick={handleSave}
            disabled={saving || !nome.trim() || !categoria}
            style={{
              height: 44,
              padding: "0 28px",
              borderRadius: 999,
              background: "#0055ff",
              border: "none",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 2,
              textTransform: "uppercase",
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              cursor: saving ? "wait" : "pointer",
              boxShadow: "0 4px 14px rgba(0, 85, 255, 0.25)",
            }}
            className="hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin text-white" /> : <Save size={16} className="text-white" />}
            {editingId ? "Atualizar Dados" : "Salvar Participante"}
          </button>
        </div>
      </section>

      {/* LIST CARD: aparece depois que o formulário já foi renderizado */}
      {listVisible && (
      <section
        style={{
          background: "#FFFFFF",
          borderRadius: 24,
          padding: "24px 28px 28px",
          border: "1px solid rgba(226, 232, 240, 0.9)",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.03)",
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
          <div
            className="nexo-table-scroll relative"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
                setVisibleCount(current => Math.min(current + 25, filtered.length));
              }
            }}
            style={{
              overflowX: "auto",
              overflowY: "auto",
              maxHeight: 565,
              borderRadius: 16,
              border: "1px solid rgba(226, 232, 240, 0.9)",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.02)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
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
                        background: CYAN,
                        position: "sticky",
                        top: 0,
                        zIndex: 10,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, visibleCount).map((a, idx) => {
                  const resolved = resolveParticipanteCategoria(a);
                  const cat = a.categoria || resolved.categoria;
                  const displayCargo = a.cargo && a.cargo !== cat ? a.cargo : (cat === "Convidado" ? "—" : a.cargo || "—");
                  return (
                    <tr key={a.id} style={{ background: idx % 2 === 0 ? "#FFFFFF" : "#F7FCFE", color: DARK, height: 52 }}>
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
                      <td style={{ padding: "10px 14px" }}>{displayCargo}</td>
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
                            onClick={() => setDeleteTarget({ id: a.id, nome: a.nome })}
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
        {!loadingList && filtered.length > visibleCount && (
          <div className="flex justify-center pt-4">
            <button
              type="button"
              onClick={() => setVisibleCount(current => Math.min(current + 25, filtered.length))}
              className="h-10 px-5 rounded-full bg-slate-50 hover:bg-blue-50 border border-slate-200 text-slate-700 hover:text-[#0055ff] font-bold text-xs uppercase tracking-wider transition-colors"
            >
              Carregar mais ({filtered.length - visibleCount} restantes)
            </button>
          </div>
        )}
      </section>
      )}

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
            <FileSpreadsheet size={44} className="text-[#0055ff] mx-auto mb-3" />
            <p style={{ fontSize: 14, fontWeight: 700, color: DARK, margin: "0 0 24px" }}>
              Deseja importar <span className="text-[#0055ff] font-extrabold">{importRows.length}</span> participante{importRows.length > 1 ? "s" : ""}?
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => setImportRows(null)}
                disabled={importing}
                className="h-11 px-6 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmImport}
                disabled={importing}
                className="h-11 px-7 rounded-full bg-[#0055ff] hover:bg-[#0047d4] text-white font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all shadow-md shadow-blue-500/20 cursor-pointer disabled:opacity-50"
              >
                {importing && <Loader2 size={14} className="animate-spin" />}
                {importing ? "Importando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
