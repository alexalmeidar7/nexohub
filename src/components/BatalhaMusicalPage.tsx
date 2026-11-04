import { DateInput } from "@/components/ui/date-input";
import { useState, useEffect, useRef } from "react";
import { scrollToForm } from "@/lib/utils";
import { Swords, Loader2, CalendarPlus, Save, RefreshCw, Link as LinkIcon, ImageOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import BatalhaScheduleTable, { type BatalhaAgendada } from "./batalha/BatalhaScheduleTable";
import { todayInBrasilia } from "@/lib/brasiliaDate";
import { findClientAccountByEmail, findClientAccountById } from "@/lib/clientAuthAccounts";

interface Artista {
  nome: string;
  musica: string;
  porcentagem: number;
  imagemUrl: string;
}

interface BattleState {
  artista1: Artista;
  artista2: Artista;
  percentagesTouched: boolean;
}

const EMPTY_ARTIST: Artista = {
  nome: "",
  musica: "",
  porcentagem: 0,
  imagemUrl: "",
};

const LOCAL_STORAGE_KEY = "vmix-batalha-musical";
const SETTINGS_KEY = "batalha_musical";
const LEGACY_UNTOUCHED_PERCENTAGE = 50;

function clampPercentage(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function normalizeArtista(value: unknown): Artista {
  const artist = value && typeof value === "object" ? (value as Partial<Artista>) : {};

  return {
    nome: typeof artist.nome === "string" ? artist.nome : "",
    musica: typeof artist.musica === "string" ? artist.musica : "",
    porcentagem: clampPercentage(artist.porcentagem),
    imagemUrl: typeof artist.imagemUrl === "string" ? artist.imagemUrl : "",
  };
}

function normalizeBattleState(value: unknown): BattleState {
  const battle = value && typeof value === "object" ? value as Partial<BattleState> : {};
  const artista1 = normalizeArtista(battle.artista1);
  const artista2 = normalizeArtista(battle.artista2);
  const isLegacyUntouchedState =
    battle.percentagesTouched !== true &&
    artista1.porcentagem === LEGACY_UNTOUCHED_PERCENTAGE &&
    artista2.porcentagem === LEGACY_UNTOUCHED_PERCENTAGE;

  return {
    artista1: isLegacyUntouchedState ? { ...artista1, porcentagem: 0 } : artista1,
    artista2: isLegacyUntouchedState ? { ...artista2, porcentagem: 0 } : artista2,
    percentagesTouched: typeof battle.percentagesTouched === "boolean"
      ? battle.percentagesTouched
      : !isLegacyUntouchedState && (artista1.porcentagem !== 0 || artista2.porcentagem !== 0),
  };
}


import { fetchArtistImageCached } from "@/lib/artistImageCache";

async function fetchArtistImage(artistName: string, skip = 0): Promise<string> {
  const artist = artistName.trim().replace(/\s+/g, ' ');
  if (!artist) return "";

  try {
    const url = await fetchArtistImageCached(artist, skip);
    return url || "";
  } catch {
    return "";
  }
}


export default function BatalhaMusicalPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const clientAcc = findClientAccountByEmail(user?.email || "") || findClientAccountById(user?.id || "");
  const targetUserId = effectiveUserId || clientAcc?.parentUserId || clientAcc?.id || user?.id;
  const targetSlug = clientAcc?.slug || (user as any)?.user_metadata?.slug || "positivafm";

  const [, setTick] = useState(0);

  // Auto-refresh badges and active state every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  const [artista1, setArtista1] = useState<Artista>({ ...EMPTY_ARTIST });
  const [artista2, setArtista2] = useState<Artista>({ ...EMPTY_ARTIST });
  const [percentagesTouched, setPercentagesTouched] = useState(false);
  const [loading1, setLoading1] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const [hasLoadedState, setHasLoadedState] = useState(false);
  const debounce1 = useRef<ReturnType<typeof setTimeout>>();
  const debounce2 = useRef<ReturnType<typeof setTimeout>>();
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const request1Ref = useRef(0);
  const request2Ref = useRef(0);
  const imageCacheRef = useRef<Record<string, string>>({});
  const skip1Ref = useRef(0);
  const skip2Ref = useRef(0);
  const editingIdRef = useRef<string | null>(null);
  const loadBatalhasRef = useRef<(() => void) | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const getLocalStorageKey = (uId: string) => `nexohub_batalhas_${uId}`;

  const persistImage = async (which: 1 | 2, url: string) => {
    if (!editingIdRef.current) return;
    const field = which === 1 ? "artista1_imagem" : "artista2_imagem";
    try {
      await supabase
        .from("batalhas_agendadas")
        .update({ [field]: url })
        .eq("id", editingIdRef.current);
    } catch {}
    toast.success("Imagem atualizada");
    loadBatalhasRef.current?.();
  };

  const handleSearchAnother = async (which: 1 | 2) => {
    const name = (which === 1 ? artista1.nome : artista2.nome).trim();
    if (!name) {
      toast.error("Digite o nome do artista primeiro");
      return;
    }
    const currentUrl = which === 1 ? artista1.imagemUrl : artista2.imagemUrl;
    if (which === 1) setLoading1(true); else setLoading2(true);

    let url = "";
    // Try up to 8 increments to find a URL different from the current one
    for (let i = 0; i < 8; i++) {
      if (which === 1) skip1Ref.current += 1; else skip2Ref.current += 1;
      const skip = which === 1 ? skip1Ref.current : skip2Ref.current;
      const next = await fetchArtistImage(name, skip);
      if (!next) break;
      if (next !== currentUrl) { url = next; break; }
    }

    if (which === 1) setLoading1(false); else setLoading2(false);
    if (!url) {
      toast.error("Nenhuma outra imagem encontrada");
      return;
    }
    const cacheKey = name.toLowerCase();
    imageCacheRef.current[cacheKey] = url;
    if (which === 1) setArtista1(prev => ({ ...prev, imagemUrl: url }));
    else setArtista2(prev => ({ ...prev, imagemUrl: url }));
    await persistImage(which, url);
  };


  const applyImageUrl = async (which: 1 | 2, url: string) => {
    const trimmed = url.trim();
    if (which === 1) setArtista1(prev => ({ ...prev, imagemUrl: trimmed }));
    else setArtista2(prev => ({ ...prev, imagemUrl: trimmed }));
    await persistImage(which, trimmed);
  };

  const handleClearImage = async (which: 1 | 2) => {
    if (which === 1) setArtista1(prev => ({ ...prev, imagemUrl: "" }));
    else setArtista2(prev => ({ ...prev, imagemUrl: "" }));
    await persistImage(which, "");
  };

  // Form always starts empty — no state restoration
  useEffect(() => {
    setHasLoadedState(true);
  }, [targetUserId]);

  // No auto-save — data is only persisted via scheduled battles

  // Fetch artist 1 image on name change (debounced)
  useEffect(() => {
    clearTimeout(debounce1.current);
    const artistName = artista1.nome.trim().replace(/\s+/g, ' ');
    skip1Ref.current = 0;
    const requestId = ++request1Ref.current;

    if (!artistName) {
      setLoading1(false);
      setArtista1(prev => prev.imagemUrl ? { ...prev, imagemUrl: "" } : prev);
      return;
    }

    const cacheKey = artistName.toLowerCase();
    const cachedUrl = imageCacheRef.current[cacheKey];

    setLoading1(false);
    debounce1.current = setTimeout(async () => {
      const cacheKey = artistName.toLowerCase();
      const cachedUrl = imageCacheRef.current[cacheKey];

      if (cachedUrl) {
        setArtista1(prev => {
          if (prev.nome.trim().toLowerCase() !== artistName.toLowerCase()) return prev;
          return { ...prev, imagemUrl: cachedUrl };
        });
        return;
      }

      setLoading1(true);
      const url = await fetchArtistImage(artistName);
      if (request1Ref.current !== requestId) return;
      if (url) {
        imageCacheRef.current[cacheKey] = url;
      }
      let persistedUrl: string | null = null;
      setArtista1(prev => {
        if (prev.nome.trim().toLowerCase() !== artistName.toLowerCase()) return prev;
        const nextUrl = url || "";
        persistedUrl = nextUrl;
        return { ...prev, imagemUrl: nextUrl };
      });
      setLoading1(false);
      if (persistedUrl !== null && editingIdRef.current) {
        await persistImage(1, persistedUrl);
      }
    }, 500);
    return () => clearTimeout(debounce1.current);
  }, [artista1.nome]);

  // Fetch artist 2 image on name change (debounced)
  useEffect(() => {
    clearTimeout(debounce2.current);
    const artistName = artista2.nome.trim().replace(/\s+/g, ' ');
    skip2Ref.current = 0;
    const requestId = ++request2Ref.current;

    if (!artistName) {
      setLoading2(false);
      setArtista2(prev => prev.imagemUrl ? { ...prev, imagemUrl: "" } : prev);
      return;
    }

    const cacheKey = artistName.toLowerCase();
    const cachedUrl = imageCacheRef.current[cacheKey];

    setLoading2(false);
    debounce2.current = setTimeout(async () => {
      const cacheKey = artistName.toLowerCase();
      const cachedUrl = imageCacheRef.current[cacheKey];

      if (cachedUrl) {
        setArtista2(prev => {
          if (prev.nome.trim().toLowerCase() !== artistName.toLowerCase()) return prev;
          return { ...prev, imagemUrl: cachedUrl };
        });
        return;
      }

      setLoading2(true);
      const url = await fetchArtistImage(artistName);
      if (request2Ref.current !== requestId) return;
      if (url) {
        imageCacheRef.current[cacheKey] = url;
      }
      let persistedUrl: string | null = null;
      setArtista2(prev => {
        if (prev.nome.trim().toLowerCase() !== artistName.toLowerCase()) return prev;
        const nextUrl = url || "";
        persistedUrl = nextUrl;
        return { ...prev, imagemUrl: nextUrl };
      });
      setLoading2(false);
      if (persistedUrl !== null && editingIdRef.current) {
        await persistImage(2, persistedUrl);
      }
    }, 500);
    return () => clearTimeout(debounce2.current);
  }, [artista2.nome]);


  const updateArtista1 = (field: keyof Artista, value: string | number) => {
    if (field === "porcentagem") {
      const nextValue = clampPercentage(value);
      setPercentagesTouched(true);
      setArtista1(prev => ({ ...prev, porcentagem: nextValue }));
      setArtista2(prev => ({ ...prev, porcentagem: 100 - nextValue }));
    } else if (field === "nome") {
      setArtista1(prev => ({ ...prev, nome: value as string }));
    } else {
      setArtista1(prev => ({ ...prev, [field]: value }));
    }
  };

  const updateArtista2 = (field: keyof Artista, value: string | number) => {
    if (field === "porcentagem") {
      const nextValue = clampPercentage(value);
      setPercentagesTouched(true);
      setArtista2(prev => ({ ...prev, porcentagem: nextValue }));
      setArtista1(prev => ({ ...prev, porcentagem: 100 - nextValue }));
    } else if (field === "nome") {
      setArtista2(prev => ({ ...prev, nome: value as string }));
    } else {
      setArtista2(prev => ({ ...prev, [field]: value }));
    }
  };

  // Use theme accent color for artista 1, and a complementary tone for artista 2
  const accentColor = "var(--layout-accent-color)";

  // --- Scheduling state ---
  const [schedDate, setSchedDate] = useState("");
  const [schedStart, setSchedStart] = useState("");
  const [schedEnd, setSchedEnd] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [batalhas, setBatalhas] = useState<BatalhaAgendada[]>([]);

  const getStoredBatalhas = (uId: string): BatalhaAgendada[] => {
    try {
      const keys = [
        getLocalStorageKey(uId),
        `nexohub_batalhas_${targetSlug}`,
        clientAcc?.slug ? `nexohub_batalhas_${clientAcc.slug}` : null,
        clientAcc?.id ? `nexohub_batalhas_${clientAcc.id}` : null,
        clientAcc?.parentUserId ? `nexohub_batalhas_${clientAcc.parentUserId}` : null,
      ].filter(Boolean) as string[];

      const map = new Map<string, BatalhaAgendada>();
      for (const k of keys) {
        const raw = localStorage.getItem(k);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              parsed.forEach((b: BatalhaAgendada) => {
                if (b && (b.artista1_nome || b.artista2_nome)) {
                  const key = b.id || `${b.data_batalha}_${b.horario_inicio}_${b.artista1_nome}`;
                  map.set(key, b);
                }
              });
            }
          } catch {}
        }
      }
      return Array.from(map.values());
    } catch {}
    return [];
  };

  const saveStoredBatalhas = (uId: string, list: BatalhaAgendada[]) => {
    try {
      const keys = [
        getLocalStorageKey(uId),
        `nexohub_batalhas_${targetSlug}`,
        clientAcc?.slug ? `nexohub_batalhas_${clientAcc.slug}` : null,
        clientAcc?.id ? `nexohub_batalhas_${clientAcc.id}` : null,
        clientAcc?.parentUserId ? `nexohub_batalhas_${clientAcc.parentUserId}` : null,
      ].filter(Boolean) as string[];

      for (const k of keys) {
        localStorage.setItem(k, JSON.stringify(list));
      }

      // Sincroniza com o servidor local e endpoints XML em tempo real
      fetch("/api/sync-xml-batalha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: targetSlug, userId: uId, batalhas: list }),
      }).catch(() => {});

      // O invoke envia o JWT da sessão atual; a Edge Function valida a emissora antes de usar Service Role.
      void supabase.functions.invoke("serve-xml-batalha", {
        body: { action: "sync", slug: targetSlug, userId: uId, batalhas: list },
      }).then(({ error }) => {
        if (error) console.warn("Falha na sincronização remota da batalha:", error);
      }).catch((error) => console.warn("Falha na chamada de sincronização da batalha:", error));
    } catch {}
  };

  const loadBatalhas = async () => {
    if (!targetUserId) return;
    let rows: BatalhaAgendada[] = [];
    let databaseLoaded = false;
    try {
      const { data, error } = await supabase.from("batalhas_agendadas")
        .select("*").eq("user_id", targetUserId)
        .order("data_batalha", { ascending: true })
        .order("horario_inicio", { ascending: true });
      if (error) throw error;
      rows = (data || []) as BatalhaAgendada[];
      databaseLoaded = true;
    } catch (err) {
      console.warn("Supabase load batalhas warning:", err);
    }

    let merged: BatalhaAgendada[] = [];
    if (databaseLoaded) {
      merged = rows;
    } else {
      let serverList: BatalhaAgendada[] = [];
      try {
        const res = await fetch("/api/sync-xml-batalha?slug=" + encodeURIComponent(targetSlug) + "&userId=" + encodeURIComponent(targetUserId));
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.batalhas)) serverList = json.batalhas;
        }
      } catch {}
      const localList = getStoredBatalhas(targetUserId);
      const fallbackList = serverList.length ? serverList : localList;
      // Sem dados confirmados no banco/servidor, não exibir batalhas antigas de demonstração.
      const map = new Map<string, BatalhaAgendada>();
      [...fallbackList].forEach((item: any) => {
        if (item && (item.artista1_nome || item.artista2_nome)) {
          const key = item.id || item.data_batalha + "_" + item.horario_inicio + "_" + item.artista1_nome;
          map.set(key, item);
        }
      });
      merged = Array.from(map.values());
    }

    merged.sort((a, b) => {
      if (a.data_batalha !== b.data_batalha) return a.data_batalha.localeCompare(b.data_batalha);
      return a.horario_inicio.localeCompare(b.horario_inicio);
    });
    setBatalhas(merged);
    saveStoredBatalhas(targetUserId, merged);
  };

  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);

  useEffect(() => {
    loadBatalhasRef.current = loadBatalhas;
  });

  useEffect(() => {
    if (targetUserId) loadBatalhas();
  }, [targetUserId]);

  const handleSchedule = async () => {
    if (!targetUserId) return;
    if (!schedDate || !schedStart || !schedEnd) {
      toast.error("Preencha data e horários");
      return;
    }
    if (!artista1.nome && !artista2.nome) {
      toast.error("Preencha pelo menos um artista");
      return;
    }
    setSaving(true);
    const id = editingId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `bat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    const newBatalha: BatalhaAgendada = {
      id,
      user_id: targetUserId,
      artista1_nome: artista1.nome,
      artista1_musica: artista1.musica,
      artista1_porcentagem: artista1.porcentagem ?? 0,
      artista1_imagem: artista1.imagemUrl,
      artista2_nome: artista2.nome,
      artista2_musica: artista2.musica,
      artista2_porcentagem: artista2.porcentagem ?? 0,
      artista2_imagem: artista2.imagemUrl,
      data_batalha: schedDate,
      horario_inicio: schedStart,
      horario_fim: schedEnd,
    };

    const payload = {
      user_id: targetUserId,
      artista1_nome: artista1.nome,
      artista1_musica: artista1.musica,
      artista1_porcentagem: artista1.porcentagem ?? 0,
      artista1_imagem: artista1.imagemUrl,
      artista2_nome: artista2.nome,
      artista2_musica: artista2.musica,
      artista2_porcentagem: artista2.porcentagem ?? 0,
      artista2_imagem: artista2.imagemUrl,
      data_batalha: schedDate,
      horario_inicio: schedStart,
      horario_fim: schedEnd,
    };

    try {
      let savedBatalha = newBatalha;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (editingId && isUuid) {
        const { data, error } = await supabase.from("batalhas_agendadas")
          .update(payload).eq("id", editingId).eq("user_id", targetUserId)
          .select("id").maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error("O banco não confirmou a atualização da batalha.");
      } else {
        const insertPayload = isUuid ? { id, ...payload } : payload;
        const { data, error } = await supabase.from("batalhas_agendadas")
          .insert([insertPayload]).select("id").single();
        if (error) throw error;
        if (!data?.id) throw new Error("O banco não confirmou o agendamento da batalha.");
        savedBatalha = { ...newBatalha, id: data.id };
      }

      const currentList = getStoredBatalhas(targetUserId);
      const updated = [savedBatalha, ...currentList.filter(b => b.id !== savedBatalha.id)].sort((a, b) => {
        if (a.data_batalha !== b.data_batalha) return a.data_batalha.localeCompare(b.data_batalha);
        return a.horario_inicio.localeCompare(b.horario_inicio);
      });
      setBatalhas(updated);
      saveStoredBatalhas(targetUserId, updated);

      try {
        const { error: syncError } = await supabase.functions.invoke("serve-xml-batalha", {
          body: { action: "save", slug: targetSlug, user_id: targetUserId, batalha: savedBatalha, batalhas: updated },
        });
        if (syncError) console.warn("Falha na sincronização XML da batalha:", syncError);
      } catch (syncError) {
        console.warn("Falha na sincronização XML da batalha:", syncError);
      }
    } catch (err: any) {
      console.error("Falha ao salvar batalha:", err);
      toast.error("Batalha não foi salva: " + (err?.message || "falha ao gravar no banco."));
      setSaving(false);
      return;
    } finally {
      setSaving(false);
    }

    toast.success(editingId ? "Batalha atualizada com sucesso" : "Batalha agendada com sucesso");
    setEditingId(null);
    setArtista1({ ...EMPTY_ARTIST });
    setArtista2({ ...EMPTY_ARTIST });
    setPercentagesTouched(false);
    skip1Ref.current = 0;
    skip2Ref.current = 0;
    setSchedDate("");
    setSchedStart("");
    setSchedEnd("");
  };

  const handleDeleteBatalha = async (id: string) => {
    if (!targetUserId) return;
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid) {
        const { data, error } = await supabase.from("batalhas_agendadas")
          .delete().eq("id", id).eq("user_id", targetUserId).select("id").maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error("O banco não confirmou a exclusão da batalha.");
      }
      const updated = getStoredBatalhas(targetUserId).filter(b => b.id !== id);
      setBatalhas(updated);
      saveStoredBatalhas(targetUserId, updated);
      try {
        const { error: syncError } = await supabase.functions.invoke("serve-xml-batalha", {
          body: { action: "delete", slug: targetSlug, user_id: targetUserId, id },
        });
        if (syncError) console.warn("Falha ao sincronizar exclusão da batalha:", syncError);
      } catch (syncError) {
        console.warn("Falha ao sincronizar exclusão da batalha:", syncError);
      }
      toast.success("Batalha excluída com sucesso");
    } catch (err: any) {
      toast.error("Batalha não foi excluída: " + (err?.message || "falha ao excluir no banco."));
    }
  };

  const handleEditBatalha = (b: BatalhaAgendada) => {
    setArtista1({
      nome: b.artista1_nome,
      musica: b.artista1_musica,
      porcentagem: b.artista1_porcentagem,
      imagemUrl: b.artista1_imagem,
    });
    setArtista2({
      nome: b.artista2_nome,
      musica: b.artista2_musica,
      porcentagem: b.artista2_porcentagem,
      imagemUrl: b.artista2_imagem,
    });
    setSchedDate(b.data_batalha);
    setSchedStart(b.horario_inicio);
    setSchedEnd(b.horario_fim);
    setEditingId(b.id);
    scrollToForm(formRef.current);
  };

  const handleReuseBatalha = (b: BatalhaAgendada) => {
    handleEditBatalha(b);
    // Reutilizar cria uma nova batalha (preserva o histórico da encerrada)
    setEditingId(null);
    setSchedDate(new Date().toLocaleDateString("en-CA"));
    toast.info("Batalha carregada no formulário — ajuste data/horário e salve");
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 60%, transparent)",
    border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)",
    borderRadius: "12px",
    color: "var(--layout-page-text, #1a1a1a)",
  };

  const labelStyle: React.CSSProperties = {
    color: "var(--layout-page-text, #1a1a1a)",
  };

  const cardBg = "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 12%, var(--layout-page-bg, #ffffff) 88%)";
  const subtleText = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 70%, transparent)";
  const borderSubtle = "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)";

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)";
    e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.8)";
  };
  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)";
    e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--layout-page-bg, #ffffff) 60%, transparent)";
  };

  return (
    <div className="nexo-scope space-y-4 w-full max-w-none mx-0">
      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        Batalha Musical
      </div>
      <div className="animate-fade-in space-y-6">
        {/* Main Form Card */}
        <div ref={formRef} className="rounded-2xl overflow-hidden" style={{ background: cardBg, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>

        {/* Card Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: borderSubtle }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(45,191,244,0.15)" }}>
              <Swords size={20} style={{ color: accentColor }} />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Batalha Musical</h3>
              <p className="text-[11px]" style={{ color: subtleText }}>Configure os artistas e acompanhe a disputa</p>
            </div>
          </div>
          <div />
        </div>

        {/* Card Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Battle bar */}
          <div className="relative h-12 rounded-xl overflow-hidden" style={{ background: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 60%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)" }}>
            <div
              className="absolute inset-y-0 left-0 transition-all duration-500 ease-out flex items-center justify-center"
              style={{ width: `${artista1.porcentagem}%`, background: accentColor }}
            >
              {artista1.porcentagem > 15 && (
                <span className="font-bold text-sm drop-shadow" style={{ color: "var(--layout-button-text)" }}>{artista1.nome || "Artista 1"} — {artista1.porcentagem}%</span>
              )}
            </div>
            <div
              className="absolute inset-y-0 right-0 transition-all duration-500 ease-out flex items-center justify-center"
              style={{ width: `${artista2.porcentagem}%`, background: "var(--layout-header-bg)" }}
            >
              {artista2.porcentagem > 15 && (
                <span className="font-bold text-sm drop-shadow" style={{ color: "var(--layout-header-text)" }}>{artista2.nome || "Artista 2"} — {artista2.porcentagem}%</span>
              )}
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <span className="font-black text-xs px-2 py-1 rounded-full" style={{ background: cardBg, color: accentColor, border: `1px solid ${accentColor}` }}>VS</span>
            </div>
          </div>

          {/* Artists grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Artista 1 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: accentColor }} />
                <h4 className="font-bold text-sm uppercase tracking-wider" style={labelStyle}>Artista 1</h4>
                {loading1 && <Loader2 className="h-3 w-3 animate-spin opacity-40" style={labelStyle} />}
              </div>
              <div className="flex flex-col items-center gap-2">
                <input
                  type="url"
                  value={artista1.imagemUrl}
                  onChange={e => setArtista1(prev => ({ ...prev, imagemUrl: e.target.value }))}
                  onBlur={e => applyImageUrl(1, e.target.value)}
                  placeholder="Cole a URL da imagem aqui"
                  className="w-full px-3 py-1.5 outline-none transition-all text-xs"
                  style={inputStyle}
                />
                {artista1.imagemUrl ? (
                  <img src={artista1.imagemUrl} alt={artista1.nome} className="w-24 h-24 rounded-full object-cover border-2" style={{ borderColor: accentColor }} />
                ) : (
                  <div className="w-24 h-24 rounded-full flex items-center justify-center border-2 border-dashed" style={{ borderColor: accentColor, opacity: 0.4 }}>
                    <ImageOff size={24} style={{ color: accentColor }} />
                  </div>
                )}
                <div className="flex items-center gap-1.5 flex-wrap justify-center">
                  <button type="button" onClick={() => handleSearchAnother(1)} disabled={loading1}
                    className="text-[10px] px-2 py-1 rounded-md inline-flex items-center gap-1 transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}>
                    <RefreshCw size={11} /> Outra foto
                  </button>
                  {artista1.imagemUrl && (
                    <button type="button" onClick={() => handleClearImage(1)}
                      className="text-[10px] px-2 py-1 rounded-md inline-flex items-center gap-1 transition-opacity hover:opacity-80"
                      style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}>
                      Remover
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={labelStyle}>Nome do Artista</label>
                <input value={artista1.nome} onChange={e => updateArtista1("nome", e.target.value)} placeholder="Ex: Bruno Mars"
                  className="w-full px-4 py-2 outline-none transition-all text-sm" style={inputStyle}
                  onFocus={handleInputFocus} onBlur={e => { handleInputBlur(e); updateArtista1("nome", artista1.nome.trim()); }} />
              </div>
              <div>
                <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={labelStyle}>Música</label>
                <input value={artista1.musica} onChange={e => updateArtista1("musica", e.target.value)} placeholder="Ex: Uptown Funk"
                  className="w-full px-4 py-2 outline-none transition-all text-sm" style={inputStyle}
                  onFocus={handleInputFocus} onBlur={handleInputBlur} />
              </div>
              <div>
                <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={labelStyle}>
                  Porcentagem: <span className="font-bold">{artista1.porcentagem}%</span>
                </label>
                <Slider value={[artista1.porcentagem]} onValueChange={([v]) => updateArtista1("porcentagem", v)} max={100} min={0} step={1} className="py-2" />
              </div>
            </div>

            {/* Artista 2 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: "var(--layout-header-bg)" }} />
                <h4 className="font-bold text-sm uppercase tracking-wider" style={labelStyle}>Artista 2</h4>
                {loading2 && <Loader2 className="h-3 w-3 animate-spin opacity-40" style={labelStyle} />}
              </div>
              <div className="flex flex-col items-center gap-2">
                <input
                  type="url"
                  value={artista2.imagemUrl}
                  onChange={e => setArtista2(prev => ({ ...prev, imagemUrl: e.target.value }))}
                  onBlur={e => applyImageUrl(2, e.target.value)}
                  placeholder="Cole a URL da imagem aqui"
                  className="w-full px-3 py-1.5 outline-none transition-all text-xs"
                  style={inputStyle}
                />
                {artista2.imagemUrl ? (
                  <img src={artista2.imagemUrl} alt={artista2.nome} className="w-24 h-24 rounded-full object-cover border-2" style={{ borderColor: "var(--layout-header-bg)" }} />
                ) : (
                  <div className="w-24 h-24 rounded-full flex items-center justify-center border-2 border-dashed" style={{ borderColor: "var(--layout-header-bg)", opacity: 0.4 }}>
                    <ImageOff size={24} style={{ color: "var(--layout-header-bg)" }} />
                  </div>
                )}
                <div className="flex items-center gap-1.5 flex-wrap justify-center">
                  <button type="button" onClick={() => handleSearchAnother(2)} disabled={loading2}
                    className="text-[10px] px-2 py-1 rounded-md inline-flex items-center gap-1 transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}>
                    <RefreshCw size={11} /> Outra foto
                  </button>
                  {artista2.imagemUrl && (
                    <button type="button" onClick={() => handleClearImage(2)}
                      className="text-[10px] px-2 py-1 rounded-md inline-flex items-center gap-1 transition-opacity hover:opacity-80"
                      style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}>
                      Remover
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={labelStyle}>Nome do Artista</label>
                <input value={artista2.nome} onChange={e => updateArtista2("nome", e.target.value)} placeholder="Ex: The Weeknd"
                  className="w-full px-4 py-2 outline-none transition-all text-sm" style={inputStyle}
                  onFocus={handleInputFocus} onBlur={e => { handleInputBlur(e); updateArtista2("nome", artista2.nome.trim()); }} />
              </div>
              <div>
                <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={labelStyle}>Música</label>
                <input value={artista2.musica} onChange={e => updateArtista2("musica", e.target.value)} placeholder="Ex: Blinding Lights"
                  className="w-full px-4 py-2 outline-none transition-all text-sm" style={inputStyle}
                  onFocus={handleInputFocus} onBlur={handleInputBlur} />
              </div>
              <div>
                <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={labelStyle}>
                  Porcentagem: <span className="font-bold">{artista2.porcentagem}%</span>
                </label>
                <Slider value={[artista2.porcentagem]} onValueChange={([v]) => updateArtista2("porcentagem", v)} max={100} min={0} step={1} className="py-2" />
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* Schedule Card */}
      {user && (
        <div className="rounded-2xl overflow-hidden" style={{ background: cardBg, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
          <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: borderSubtle }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(45,191,244,0.15)" }}>
              <CalendarPlus size={20} style={{ color: accentColor }} />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                {editingId ? "Editar Batalha Agendada" : "Agendar Batalha"}
              </h3>
              <p className="text-[11px]" style={{ color: subtleText }}>Os dados dos artistas acima serão usados para a batalha agendada</p>
            </div>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={labelStyle}>Data</label>
                <DateInput value={schedDate} onChange={(e) => setSchedDate(e.target.value)}
                  className="w-full px-4 py-2 outline-none transition-all text-sm" style={inputStyle}
                  onFocus={handleInputFocus} onBlur={handleInputBlur} />
              </div>
              <div>
                <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={labelStyle}>Horário Início</label>
                <input type="time" value={schedStart} onChange={(e) => setSchedStart(e.target.value)}
                  className="w-full px-4 py-2 outline-none transition-all text-sm" style={inputStyle}
                  onFocus={handleInputFocus} onBlur={handleInputBlur} />
              </div>
              <div>
                <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={labelStyle}>Horário Fim</label>
                <input type="time" value={schedEnd} onChange={(e) => setSchedEnd(e.target.value)}
                  className="w-full px-4 py-2 outline-none transition-all text-sm" style={inputStyle}
                  onFocus={handleInputFocus} onBlur={handleInputBlur} />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="save"
                onClick={handleSchedule}
                disabled={saving}
                className="w-full sm:w-auto font-bold rounded-xl"
                style={{ background: accentColor, color: "var(--layout-button-text)" }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                {editingId ? "Salvar Alterações" : "Agendar Batalha"}
              </Button>
              {editingId && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                    setArtista1({ ...EMPTY_ARTIST });
                    setArtista2({ ...EMPTY_ARTIST });
                    setPercentagesTouched(false);
                    skip1Ref.current = 0;
                    skip2Ref.current = 0;
                    setSchedDate("");
                    setSchedStart("");
                    setSchedEnd("");
                  }}
                  className="opacity-70 hover:opacity-100 text-xs rounded-xl"
                  style={{ color: "var(--layout-page-text, #1a1a1a)" }}
                >
                  Nova Batalha / Limpar Formulário
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scheduled battles table */}
      <BatalhaScheduleTable batalhas={batalhas} onEdit={handleEditBatalha} onRefresh={loadBatalhas} onDelete={handleDeleteBatalha} />
      <BatalhaScheduleTable mode="encerradas" batalhas={batalhas} onEdit={handleEditBatalha} onReuse={handleReuseBatalha} onRefresh={loadBatalhas} onDelete={handleDeleteBatalha} />
      </div>
    </div>
  );
}
