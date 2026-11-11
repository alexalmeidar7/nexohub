import { DateInput } from "@/components/ui/date-input";
import { useState, useEffect, useRef, useMemo, useLayoutEffect, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Plus, Pencil, Check, X, Upload, ChevronDown, RotateCcw, Search, Copy, Settings2 } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { useToast } from "@/hooks/use-toast";

import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { findClientAccountByEmail, findClientAccountById } from "@/lib/clientAuthAccounts";
import { getClientHouseMixProgramsSync } from "@/lib/houseMixProgramasService";
import { getSnapshotLogos, getSnapshotProgramas } from "@/lib/supabaseDatabaseSnapshot";
import { lazyRetry } from "@/lib/lazyRetry";
const LogoTransformModal = lazyRetry(() => import("./LogoTransformModal").then((module) => ({ default: module.LogoTransformModal })));
import { resolveSponsorLogoUrl } from "@/lib/sponsorLogoResolver";

// A arte padrão (/default-sponsor-logo.png) é praticamente transparente; no fundo preto parece um quadrado vazio.
const MISSING_LOGO_PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="18" y="12" width="64" height="58" rx="10" fill="none" stroke="#64748b" stroke-width="3" stroke-dasharray="6 5"/><path d="M32 58l12-14 9 10 6-7 9 11z" fill="#64748b"/><circle cx="63" cy="28" r="5" fill="#64748b"/><text x="50" y="88" font-family="Arial" font-size="10" font-weight="700" fill="#94a3b8" text-anchor="middle">SEM LOGO</text></svg>'
)}`;
const sponsorLogoSrc = (url?: string | null, name?: string | null) => {
  const resolved = resolveSponsorLogoUrl(url, name);
  return resolved.includes("default-sponsor-logo.png") ? MISSING_LOGO_PLACEHOLDER : resolved;
};

interface Logo {
  id: string;
  programa_id: string | null;
  programa_nome?: string;
  logo_url: string;
  data_final: string;
  ativo: boolean;
  created_at: string;
  nome: string;
  excluido: boolean;
  excluido_at: string | null;
  user_id?: string;
}

interface Programa {
  id: string;
  nome: string;
  estudio?: string | null;
  horario_inicio?: string | null;
}

const inputStyle: React.CSSProperties = {
  backgroundColor: "#f8fafc",
  border: "1px solid rgba(226, 232, 240, 0.9)",
  color: "#002132",
  borderRadius: 999,
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 12,
  fontWeight: 600,
  outline: "none",
  transition: "all 0.2s ease",
};

export function isExcludedStudio(raw?: string | null): boolean {
  if (!raw) return false;
  const s = raw
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (s.includes("CRISTAL")) return true;
  if (s.includes("PRINCIPAL")) return true;
  if (s.includes("TRANSMISSAO WEB") || s.includes("TRANSMISSAO AO VIVO") || s.includes("ESTUDIO WEB")) return true;
  return false;
}

const getLocalStorageKey = (uId: string) => `nexohub_logos_${uId}`;

function resolveStationUid(targetUserId?: string | null, effectiveUserId?: string | null, userObj?: any): string {
  const acc = (targetUserId && findClientAccountById(targetUserId)) || 
              (targetUserId && findClientAccountByEmail(targetUserId)) || 
              (effectiveUserId && findClientAccountById(effectiveUserId)) ||
              (effectiveUserId && findClientAccountByEmail(effectiveUserId)) ||
              (userObj?.id && findClientAccountById(userObj.id)) || 
              (userObj?.email && findClientAccountByEmail(userObj.email)) ||
              (userObj?.user_metadata?.slug && findClientAccountById(userObj.user_metadata.slug));

  if (acc?.isSubUser && acc.parentUserId) {
    return acc.parentUserId;
  }
  return acc?.id || targetUserId || effectiveUserId || userObj?.id || "";
}

function resolveStationSlug(targetUserId?: string | null, effectiveUserId?: string | null, userObj?: any): string {
  const acc = (targetUserId && findClientAccountById(targetUserId)) || 
              (targetUserId && findClientAccountByEmail(targetUserId)) || 
              (effectiveUserId && findClientAccountById(effectiveUserId)) ||
              (effectiveUserId && findClientAccountByEmail(effectiveUserId)) ||
              (userObj?.id && findClientAccountById(userObj.id)) || 
              (userObj?.email && findClientAccountByEmail(userObj.email)) ||
              (userObj?.user_metadata?.slug && findClientAccountById(userObj.user_metadata.slug));

  if (acc?.slug) return acc.slug;
  if (userObj?.user_metadata?.slug) return userObj.user_metadata.slug;
  const raw = `${targetUserId || ""} ${effectiveUserId || ""} ${userObj?.id || ""} ${userObj?.email || ""}`.toLowerCase();
  if (raw.includes("interativa")) return "interativafm";
  if (raw.includes("positiva")) return "positivafm";
  if (raw.includes("cultura")) return "culturafm";
  return "interativafm";
}

export function normalizeProgName(s?: string | null): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function getLocalLogos(uId: string): Logo[] {
  try {
    const raw = localStorage.getItem(getLocalStorageKey(uId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((l: any) => ({
          ...l,
          logo_url: (l.logo_url && typeof l.logo_url === "string" && l.logo_url.startsWith("data:image/svg+xml"))
            ? resolveSponsorLogoUrl(null, l.nome)
            : l.logo_url
        }));
      }
    }
  } catch {}
  return [];
}

function saveLocalLogos(uId: string, list: Logo[]) {
  try {
    localStorage.setItem(getLocalStorageKey(uId), JSON.stringify(list));
  } catch (e) {
    console.warn("Falha ao salvar logos no localStorage:", e);
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface LogosPatrocinadoresPageProps {
  effectiveUserId?: string | null;
}

export default function LogosPatrocinadoresPage({ effectiveUserId }: LogosPatrocinadoresPageProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [logos, setLogos] = useState<Logo[]>([]);
  const [excludedLogos, setExcludedLogos] = useState<Logo[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dataUserId, setDataUserId] = useState<string | null>(() => {
    return effectiveUserId || resolveStationUid(null, effectiveUserId, user) || user?.id || "positivafm";
  });

  const [programaId, setProgramaId] = useState("");
  const [programaIds, setProgramaIds] = useState<string[]>([]);
  const [programaPickerOpen, setProgramaPickerOpen] = useState(false);
  const [programaSearch, setProgramaSearch] = useState("");
  const programaPickerRef = useRef<HTMLDivElement>(null);
  const programaPortalRef = useRef<HTMLDivElement>(null);
  const programaTriggerRef = useRef<HTMLButtonElement>(null);
  const [programaPickerPos, setProgramaPickerPos] = useState<{ top: number; left: number; width: number } | null>(null);
  // Default expiration: last day of December of current year
  const defaultExpiration = useMemo(() => {
    const y = new Date().getFullYear();
    return `${y}-12-31`;
  }, []);
  const [dataFinal, setDataFinal] = useState(defaultExpiration);
  const [nomeLogo, setNomeLogo] = useState("");
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string; nome: string }[]>([]);
  const [existingLogoUrl, setExistingLogoUrl] = useState<string | null>(null);

  const [editingLogoId, setEditingLogoId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editingFullId, setEditingFullId] = useState<string | null>(null);

  const [cadastroOpen, setCadastroOpen] = useState(true);
  const [excluidasOpen, setExcluidasOpen] = useState(false);
  const [excluidasSearch, setExcluidasSearch] = useState("");
  const [restoreLogo, setRestoreLogo] = useState<Logo | null>(null);
  const [restoreProgramaIds, setRestoreProgramaIds] = useState<string[]>([]);
  const [restoring, setRestoring] = useState(false);

  // AI Logo Transformation states
  const [transformModalOpen, setTransformModalOpen] = useState(false);
  const [clientSelectedFile, setClientSelectedFile] = useState<File | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Logo | null>(null);
  const clientLogoInputRef = useRef<HTMLInputElement>(null);

  const isProgramSelected = Boolean(
    editingFullId
      ? (programaId && programaId !== "__none__")
      : programaIds.some((id) => id && id !== "__none__")
  );

  const dragItem = useRef<Logo | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (effectiveUserId) {
      setDataUserId(effectiveUserId);
      return;
    }

    if (!user) return;
    const resolvedId = resolveStationUid(null, null, user);
    setDataUserId(resolvedId || user.id);
    const isUuid = (s?: string | null) => Boolean(s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));
    let cancelled = false;

    const baseQuery = supabase.from("sub_users").select("parent_user_id, ativo");
    const subQuery = isUuid(user.id)
      ? baseQuery.or(`auth_user_id.eq.${user.id},email.eq.${user.email || ""}`)
      : user.email
      ? baseQuery.eq("email", user.email)
      : null;

    if (subQuery) {
      subQuery.maybeSingle().then(({ data }) => {
        if (cancelled) return;
        if (data?.ativo && data.parent_user_id) {
          setDataUserId(data.parent_user_id);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [user, effectiveUserId]);

  const loadData = async (targetUserId = dataUserId || effectiveUserId || user?.id) => {
    const stationUid = resolveStationUid(targetUserId, effectiveUserId, user) || targetUserId || effectiveUserId || user?.id || "";
    const stationSlug = resolveStationSlug(targetUserId, effectiveUserId, user);
    const cachedMap = new Map<string, Logo>();
    for (const cacheKey of Array.from(new Set([stationUid, stationSlug, targetUserId, effectiveUserId, user?.id].filter(Boolean) as string[]))) {
      getLocalLogos(cacheKey).forEach((logo) => cachedMap.set(logo.id, logo));
    }
    const cachedLogos = Array.from(cachedMap.values());
    if (cachedLogos.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 180);
      const expired = (logo: Logo) => Boolean(logo.data_final && new Date(logo.data_final + "T23:59:59").getTime() < today.getTime());
      setLogos(cachedLogos.filter((logo) => !logo.excluido && !expired(logo)));
      setExcludedLogos(cachedLogos.filter((logo) =>
        (logo.excluido && logo.excluido_at && new Date(logo.excluido_at) > cutoff) || (!logo.excluido && expired(logo))
      ));
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      let lData: any[] = [];
      let pData: any[] = [];

      // Maintenance cleanup must not delay the page's data requests.
      void Promise.resolve(supabase.rpc("cleanup_comercial")).then(({ error }) => {
        if (error) console.warn("Limpeza comercial adiada:", error.message);
      }).catch(() => {});

      // 1. Check database table first
      const dbTargetId = stationUid || targetUserId;
      let dbLogosOk = false;
      if (dbTargetId) {
        try {
          // Never let an unresponsive database request keep the sponsor-logos window
          // waiting indefinitely. Abort these first-pass queries and continue through
          // the existing XML/local-cache fallback paths when the connection stalls.
          const queryTimeout = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
            ? AbortSignal.timeout(5000)
            : undefined;
          const [resL, resP] = await Promise.all([
            supabase.from("logos_patrocinadores").select("*").eq("user_id", dbTargetId).order("created_at", { ascending: false })
              .abortSignal(queryTimeout as AbortSignal),
            supabase.from("programas").select("id, nome, estudio, horario_inicio").eq("user_id", dbTargetId).eq("ativo", true)
              .abortSignal(queryTimeout as AbortSignal),
          ]);
          if (!resL.error && Array.isArray(resL.data)) dbLogosOk = true;
          if (resL.data && resL.data.length > 0) lData = resL.data;
          if (resP.data && resP.data.length > 0) {
            pData = resP.data.map((p: any) => ({
              id: p.id,
              nome: p.nome,
              estudio: p.estudio || "ESTÚDIO FM",
              horario_inicio: p.horario_inicio || "08:00:00",
            }));
          }
        } catch (err) {
          console.warn("Erro ao buscar logos do supabase:", err);
        }
      }

      // 1.1 Fetch real logos from candidate XML feeds or local endpoints
      if (lData.length === 0 && !dbLogosOk) {
        const candidateUrls = [
          `/xml/${stationSlug}/logos.xml`,
          `/xml/${stationSlug.replace(/fm$/i, "")}/logos.xml`,
          `/functions/v1/serve-xml-logos?user_id=${stationUid}&slug=${stationSlug}`,
          `/xml/logos.xml`,
          `https://qazvgmgdidjhbvcuinpy.supabase.co/functions/v1/serve-xml-logos?user_id=${stationUid}`,
        ];

        const xmlResponses = await Promise.all(candidateUrls.map(async (url) => {
          try {
            const resXml = await fetch(url, {
              signal: AbortSignal.timeout ? AbortSignal.timeout(2000) : undefined,
            });
            return resXml.ok ? await resXml.text() : "";
          } catch {
            return "";
          }
        }));
        for (const xmlText of xmlResponses) {
          if (lData.length > 0) break;
          if (xmlText.includes("<programa") && xmlText.includes("<logo")) {
                const progMatches = [...xmlText.matchAll(/<programa id="([^"]+)">([\s\S]*?)<\/programa>/g)];
                for (const m of progMatches) {
                  const content = m[2];
                  const nomeMatch = content.match(/<nome>([\s\S]*?)<\/nome>/);
                  const progNome = (nomeMatch ? nomeMatch[1] : "").trim();
                  let matchedProg = pData.find(
                    (p) => normalizeProgName(p.nome) === normalizeProgName(progNome) || p.id === m[1]
                  );
                  if (!matchedProg && progNome) {
                    matchedProg = {
                      id: m[1] || progNome.toLowerCase().replace(/[^a-z0-9]/g, "_"),
                      nome: progNome,
                      estudio: "ESTÚDIO FM",
                      horario_inicio: "08:00:00",
                    };
                    pData.push(matchedProg);
                  }
                  const progId = matchedProg?.id || progNome;

                  const logoMatches = [...content.matchAll(/<logo>([\s\S]*?)<\/logo>/g)];
                  for (const lm of logoMatches) {
                    const lName = (lm[1].match(/<nome>([\s\S]*?)<\/nome>/)?.[1] || "").trim();
                    const lUrl = (lm[1].match(/<url>([\s\S]*?)<\/url>/)?.[1] || "").trim();
                    if (lUrl && !lUrl.includes("default-sponsor-logo.png")) {
                      lData.push({
                        id: `db_xml_${stationUid}_${progId}_${lName.replace(/\s+/g, "_")}`,
                        user_id: stationUid,
                        programa_id: progId,
                        programa_nome: progNome,
                        logo_url: lUrl,
                        data_final: `${new Date().getFullYear() + 2}-12-31`,
                        ativo: true,
                        created_at: new Date().toISOString(),
                        nome: lName.toUpperCase(),
                        excluido: false,
                        excluido_at: null,
                      });
                    }
                  }
                }
          }
        }
      }

      // 1.2 Fallback to local database snapshot if still empty
      if (lData.length === 0 && !dbLogosOk) {
        const snapLogos = getSnapshotLogos(stationUid).concat(getSnapshotLogos(stationSlug));
        if (snapLogos.length > 0) {
          const seen = new Set<string>();
          snapLogos.forEach((sl: any) => {
            const dedupeKey = `${sl.programa_id || sl.programa_nome}_${sl.nome}_${sl.logo_url}`;
            if (!seen.has(dedupeKey)) {
              seen.add(dedupeKey);
              lData.push({
                id: sl.id || `snap_${stationUid}_${Math.random().toString(36).slice(2)}`,
                user_id: sl.user_id || stationUid,
                programa_id: sl.programa_id || null,
                programa_nome: sl.programa_nome || sl.programa_id || undefined,
                logo_url: sl.logo_url,
                data_final: sl.data_final || `${new Date().getFullYear() + 2}-12-31`,
                ativo: sl.ativo !== false,
                created_at: sl.created_at || new Date().toISOString(),
                nome: (sl.nome || "").toUpperCase(),
                excluido: Boolean(sl.excluido),
                excluido_at: sl.excluido_at || null,
              });
            }
          });
        }
      }

      // Merge locally stored logos for this station
      const localUids = Array.from(new Set([stationUid, stationSlug, targetUserId, effectiveUserId, user?.id].filter(Boolean) as string[]));
      for (const uId of localUids) {
        const localLogos = getLocalLogos(uId);
        if (localLogos.length > 0) {
          const map = new Map<string, any>();
          lData.forEach((l: any) => map.set(l.id, l));
          localLogos.forEach((l: any) => {
            if (!map.has(l.id)) {
              // Banco respondeu: cache local não ressuscita registros do banco
              if (dbLogosOk && /^[0-9a-f-]{36}$/i.test(String(l.id))) return;
              map.set(l.id, l);
            } else if (!dbLogosOk) {
              map.set(l.id, { ...map.get(l.id), ...l });
            }
          });
          lData = Array.from(map.values());
        }
      }

      // Ensure all sponsor logo URLs are safe, active, and have zero broken images
      lData = (lData || []).map((l: any) => ({
        ...l,
        logo_url: resolveSponsorLogoUrl(l.logo_url, l.nome),
      }));

      // Cache loaded logos to localStorage for resilient offline/network loads
      if (lData.length > 0) {
        if (stationUid) saveLocalLogos(stationUid, lData);
        if (stationSlug) saveLocalLogos(stationSlug, lData);
      }

      // Import the large legacy program resolver only when the direct query,
      // XML feeds and snapshots did not provide programs.
      if (pData.length === 0) {
        try {
          const { getProgramas } = await import("./ProgramaForm");
          const fallbackProgs = await getProgramas(targetUserId || undefined, user?.email);
          if (fallbackProgs?.length) {
            fallbackProgs.forEach((fp: any) => {
              if (!pData.some((p) => (p.id && p.id === fp.id) || normalizeProgName(p.nome) === normalizeProgName(fp.nome))) {
                pData.push({
                  id: fp.id || fp.nome.toLowerCase().replace(/[^a-z0-9]/g, "_"),
                  nome: fp.nome,
                  estudio: fp.estudio || "ESTÚDIO FM",
                  horario_inicio: fp.horario_inicio || fp.horarioInicio || "08:00:00",
                });
              }
            });
          }
        } catch {}
      }

      // Always merge official programming grid / House Mix programs for this station
      try {
        const clientAcc = findClientAccountById(stationUid) || findClientAccountById(stationSlug) || findClientAccountByEmail(user?.email);
        const hmProgs = getClientHouseMixProgramsSync(clientAcc || stationUid || stationSlug || targetUserId || effectiveUserId || user?.id || user?.email, pData);
        if (Array.isArray(hmProgs) && hmProgs.length > 0) {
          hmProgs.forEach((hp: any) => {
            if (isExcludedStudio(hp.estudio)) return;
            if (!pData.some((p) => (p.id && p.id === hp.id) || normalizeProgName(p.nome) === normalizeProgName(hp.nome))) {
              pData.push({
                id: hp.id || hp.nome.toLowerCase().replace(/[^a-z0-9]/g, "_"),
                nome: hp.nome,
                estudio: hp.estudio || "ESTÚDIO FM",
                horario_inicio: hp.horario_inicio || "08:00:00",
              });
            }
          });
        }
      } catch (err) {
        console.warn("Erro ao mesclar programas da grade House Mix:", err);
      }

      // Merge snapshot programs if needed
      try {
        const snapProgs = getSnapshotProgramas(stationUid).concat(getSnapshotProgramas(stationSlug));
        snapProgs.forEach((sp: any) => {
          if (isExcludedStudio(sp.estudio)) return;
          if (!pData.some((p) => (p.id && p.id === sp.id) || normalizeProgName(p.nome) === normalizeProgName(sp.nome))) {
            pData.push({
              id: sp.id || sp.nome.toLowerCase().replace(/[^a-z0-9]/g, "_"),
              nome: sp.nome,
              estudio: sp.estudio || "ESTÚDIO FM",
              horario_inicio: sp.horario_inicio || "08:00:00",
            });
          }
        });
      } catch (err) {
        console.warn("Erro ao mesclar programas do snapshot:", err);
      }

      // Ensure all logos have their associated program represented in pData
      lData.forEach((l: any) => {
        const pIdentifier = l.programa_nome || l.programa_id;
        if (pIdentifier && !pData.some((p) => p.id === l.programa_id || normalizeProgName(p.nome) === normalizeProgName(pIdentifier) || normalizeProgName(p.id) === normalizeProgName(pIdentifier))) {
          pData.push({
            id: l.programa_id || pIdentifier,
            nome: pIdentifier,
            estudio: "ESTÚDIO FM",
            horario_inicio: "08:00:00",
          });
        }
      });

      const all = (lData || []) as Logo[];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 180);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isExpired = (l: Logo) => {
        if (!l.data_final) return false;
        const d = new Date(l.data_final + "T23:59:59");
        return d.getTime() < today.getTime();
      };

      setLogos(all.filter((l) => !l.excluido && !isExpired(l)));
      setExcludedLogos(
        all.filter((l) => {
          if (l.excluido && l.excluido_at && new Date(l.excluido_at) > cutoff) return true;
          if (!l.excluido && isExpired(l)) return true;
          return false;
        })
      );
      // Exclui estúdios (ESTÚDIO CRISTAL, ESTÚDIO PRINCIPAL, ESTÚDIO TRANSMISSÃO WEB) e seus programas
      const cleanProgramas = (pData || []).filter((p) => !isExcludedStudio(p.estudio));
      setProgramas(cleanProgramas);
    } catch (e) {
      console.error("Erro geral no loadData de logos:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(dataUserId || effectiveUserId || user?.id);
  }, [dataUserId, effectiveUserId, user]);

  useEffect(() => {
    if (!programaPickerOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        (!programaPickerRef.current || !programaPickerRef.current.contains(target)) &&
        (!programaPortalRef.current || !programaPortalRef.current.contains(target)) &&
        (!programaTriggerRef.current || !programaTriggerRef.current.contains(target))
      ) {
        setProgramaPickerOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProgramaPickerOpen(false);
    };
    const updatePos = () => {
      const r = programaTriggerRef.current?.getBoundingClientRect();
      if (r) setProgramaPickerPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    updatePos();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [programaPickerOpen]);

  const handleAddFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const items = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      nome: file.name.replace(/\.[^.]+$/, "").trim().toUpperCase(),
    }));
    setPendingFiles((prev) => [...prev, ...items]);
    e.target.value = "";
  };

  const handleClientLogoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setClientSelectedFile(file);
    setTransformModalOpen(true);
    e.target.value = "";
  };

  const updatePendingName = (idx: number, nome: string) => {
    setPendingFiles((prev) => prev.map((p, i) => (i === idx ? { ...p, nome } : p)));
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadLogo = async (file: File): Promise<string> => {
    // Keep original PNG format — do NOT compress to webp for sponsor logos
    const activeUid =
      dataUserId ||
      effectiveUserId ||
      resolveStationUid(dataUserId, effectiveUserId, user) ||
      user?.id ||
      "logos";
    const ext = file.name.split(".").pop() || "png";
    const path = `${activeUid}/logos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    // 1. Try comercial storage bucket
    try {
      const { data, error } = await supabase.storage
        .from("comercial")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (!error && data) {
        const { data: pubData } = supabase.storage.from("comercial").getPublicUrl(path);
        if (pubData?.publicUrl) return pubData.publicUrl;
      }
    } catch (e) {
      console.warn("[uploadLogo] comercial notice:", e);
    }

    // 2. Try empresa-assets bucket
    try {
      const { data: eaData, error: eaError } = await supabase.storage
        .from("empresa-assets")
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
      if (!eaError && eaData) {
        const { data: pubData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
        if (pubData?.publicUrl) return pubData.publicUrl;
      }
    } catch (e) {
      console.warn("[uploadLogo] empresa-assets notice:", e);
    }

    // 3. Resilient fallback: convert file to Base64 Data URL so logo registration NEVER fails
    return await fileToDataUrl(file);
  };

  const startAdjustLogo = async (logo: Logo) => {
    const src = sponsorLogoSrc(logo.logo_url, logo.nome);
    if (src === MISSING_LOGO_PLACEHOLDER) {
      toast({ title: "Esta logo não tem imagem", description: "Envie o arquivo da logo pela edição antes de ajustar.", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], `${(logo.nome || "logo").trim() || "logo"}.png`, { type: blob.type || "image/png" });
      setAdjustTarget(logo);
      setClientSelectedFile(file);
      setTransformModalOpen(true);
    } catch (err: any) {
      toast({ title: "Não foi possível abrir a imagem da logo", description: err?.message, variant: "destructive" });
    }
  };

  // Substitui a imagem da logo existente pela versão ajustada (mesmo registro, mesmo programa).
  const replaceLogoImage = async (target: Logo, file: File) => {
    const activeUid =
      dataUserId ||
      effectiveUserId ||
      resolveStationUid(dataUserId, effectiveUserId, user) ||
      user?.id ||
      "";
    try {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.id)) {
        throw new Error("Não foi possível identificar esta logo com segurança no banco. Recarregue a página e tente novamente.");
      }
      const logo_url = await uploadLogo(file);
      const { data, error } = await supabase
        .from("logos_patrocinadores")
        .update({ logo_url })
        .eq("id", target.id)
        .eq("logo_url", target.logo_url)
        .select("id");
      if (error) throw error;
      if (data?.length !== 1) {
        throw new Error("A logo não foi atualizada: o registro mudou ou não foi encontrado. Recarregue a página e tente novamente.");
      }
      if (activeUid) {
        const localList = getLocalLogos(activeUid);
        const idx = localList.findIndex((l) => l.id === target.id);
        if (idx >= 0) {
          localList[idx] = { ...localList[idx], logo_url };
          saveLocalLogos(activeUid, localList);
        } else {
          saveLocalLogos(activeUid, [{ ...target, logo_url }, ...localList]);
        }
      }
      toast({ title: "Logo ajustada e salva!", description: `"${target.nome}" agora está em branco flat com fundo transparente.` });
      await loadData();
    } catch (err: any) {
      toast({ title: "Erro ao salvar a logo ajustada", description: err?.message, variant: "destructive" });
      throw err;
    }
  };

  const handleApproveAndSaveAiLogo = async (result: {
    file: File;
    nome: string;
    programaIds: string[];
    dataFinal: string;
    version: string;
  }) => {
    if (adjustTarget) return replaceLogoImage(adjustTarget, result.file);
    const { file, nome, programaIds: targets, dataFinal: expDate } = result;
    const activeUid =
      dataUserId ||
      effectiveUserId ||
      resolveStationUid(dataUserId, effectiveUserId, user) ||
      user?.id ||
      "";

    try {
      const logo_url = await uploadLogo(file);
      const toDbPid = (v: string) => (v === "__none__" ? null : v);
      const currentLocal = activeUid ? getLocalLogos(activeUid) : [];
      const newItems: Logo[] = [];

      for (const pid of targets) {
        const dbPid = toDbPid(pid);
        const progName =
          programas.find((p) => p.id === pid)?.nome || (pid === "__none__" ? "SEM PROGRAMA" : pid);
        const newLogo: Logo = {
          id: `logo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          user_id: activeUid,
          programa_id: dbPid,
          programa_nome: progName,
          logo_url,
          data_final: expDate,
          nome: nome.toUpperCase(),
          ativo: true,
          created_at: new Date().toISOString(),
          excluido: false,
          excluido_at: null,
        };

        try {
          const { data: insData, error } = await supabase
            .from("logos_patrocinadores")
            .insert({
              user_id: activeUid,
              programa_id: dbPid,
              logo_url,
              data_final: expDate,
              nome: nome.toUpperCase(),
            } as any)
            .select()
            .maybeSingle();

          if (!error && insData?.id) {
            newLogo.id = insData.id;
          }
        } catch (dbErr) {
          console.warn("[handleApproveAndSaveAiLogo] Supabase notice:", dbErr);
        }

        newItems.push(newLogo);
      }

      if (activeUid) {
        saveLocalLogos(activeUid, [...newItems, ...currentLocal]);
      }

      toast({
        title: "Logo aprovada e salva com sucesso!",
        description: `"${nome.toUpperCase()}" vinculada com sucesso.`,
      });

      await loadData();
    } catch (err: any) {
      toast({
        title: "Erro ao salvar logo aprovada",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targets = editingFullId ? (programaId ? [programaId] : []) : programaIds;
    if (!user || targets.length === 0 || !dataFinal) {
      toast({ title: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }

    const toDbPid = (v: string) => (v === "__none__" ? null : v);
    const activeUid =
      dataUserId ||
      effectiveUserId ||
      resolveStationUid(dataUserId, effectiveUserId, user) ||
      user?.id ||
      "";

    // Edit mode: update existing logo
    if (editingFullId) {
      setSaving(true);
      try {
        const updateData: any = { programa_id: toDbPid(targets[0]), data_final: dataFinal, nome: nomeLogo };
        if (pendingFiles.length > 0) {
          updateData.logo_url = await uploadLogo(pendingFiles[0].file);
        }

        const { data: updatedRows, error: updateError } = await supabase.from("logos_patrocinadores")
          .update(updateData).eq("id", editingFullId).eq("user_id", activeUid).select("id");
        if (updateError) throw updateError;
        if (!updatedRows?.length) throw new Error("O banco não confirmou a atualização da logo.");

        if (activeUid) {
          const localList = getLocalLogos(activeUid);
          const idx = localList.findIndex((l) => l.id === editingFullId);
          if (idx >= 0) {
            localList[idx] = { ...localList[idx], ...updateData };
            saveLocalLogos(activeUid, localList);
          } else {
            const curr = logos.find((l) => l.id === editingFullId);
            if (curr) {
              saveLocalLogos(activeUid, [{ ...curr, ...updateData }, ...localList]);
            }
          }
        }

        toast({ title: "Logo atualizada com sucesso!" });
        resetForm();
        await loadData();
      } catch (err: any) {
        toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
      } finally {
        setSaving(false);
      }
      return;
    }

    // Create mode
    if (pendingFiles.length === 0) {
      toast({ title: "Adicione pelo menos uma logo.", variant: "destructive" });
      return;
    }
    setSaving(true);

    try {
      let count = 0;
      const currentLocal = activeUid ? getLocalLogos(activeUid) : [];
      const newItems: Logo[] = [];

      for (const pf of pendingFiles) {
        const logo_url = await uploadLogo(pf.file);
        const nomeFinal = (pf.nome || pf.file.name.replace(/\.[^.]+$/, "")).trim().toUpperCase();
        for (const pid of targets) {
          const dbPid = toDbPid(pid);
          const progName = programas.find((p) => p.id === pid)?.nome || (pid === "__none__" ? "SEM PROGRAMA" : pid);
          const newLogo: Logo = {
            id: `logo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            user_id: activeUid,
            programa_id: dbPid,
            programa_nome: progName,
            logo_url,
            data_final: dataFinal,
            nome: nomeFinal,
            ativo: true,
            created_at: new Date().toISOString(),
            excluido: false,
            excluido_at: null,
          };

          try {
            const { data: insData, error } = await supabase.from("logos_patrocinadores").insert({
              user_id: activeUid,
              programa_id: dbPid,
              logo_url,
              data_final: dataFinal,
              nome: nomeFinal,
            } as any).select().maybeSingle();

            if (error) throw error;
            if (!insData?.id) throw new Error("O banco não confirmou o cadastro da logo.");
            newLogo.id = insData.id;
          } catch (dbErr) {
            throw dbErr;
          }

          newItems.push(newLogo);
          count++;
        }
      }

      if (activeUid) {
        saveLocalLogos(activeUid, [...newItems, ...currentLocal]);
      }

      toast({ title: `${count} logo(s) salva(s) em ${targets.length} destino(s)!` });
      resetForm();
      await loadData();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setProgramaId("");
    setProgramaIds([]);
    setDataFinal(defaultExpiration);
    setNomeLogo("");
    setPendingFiles([]);
    setExistingLogoUrl(null);
    setEditingFullId(null);
  };

  const startFullEdit = (logo: Logo) => {
    setEditingFullId(logo.id);
    setNomeLogo(logo.nome || "");
    setProgramaId(logo.programa_id || "__none__");
    setDataFinal(logo.data_final);
    setExistingLogoUrl(logo.logo_url);
    setPendingFiles([]);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Atualiza o registro real no banco: tenta pelo id; se não achar (id de cache/XML/snapshot),
  // localiza pelo dono + arquivo da imagem (+ programa). Garante sessão válida antes.
  const updateLogoRecord = async (item: Logo | undefined, id: string, patch: Record<string, any>, ownerFallback: string) => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess?.session) {
      const { data: ref } = await supabase.auth.refreshSession();
      if (!ref?.session) throw new Error("Sua sessão expirou. Saia e entre novamente para continuar.");
    }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (isUuid) {
      const { data, error } = await supabase.from("logos_patrocinadores").update(patch).eq("id", id).select("id");
      if (error) throw error;
      if (data && data.length > 0) return data;
    }
    const owner = item?.user_id && /^[0-9a-f-]{36}$/i.test(item.user_id) ? item.user_id : ownerFallback;
    const file = (item?.logo_url || "").split("?")[0].split("/").pop();
    if (!file || !owner) throw new Error("Não foi possível identificar a logo no banco.");
    let q = supabase.from("logos_patrocinadores").update(patch).eq("user_id", owner).ilike("logo_url", `%${file}%`);
    if (item?.programa_id && /^[0-9a-f-]{36}$/i.test(item.programa_id)) q = q.eq("programa_id", item.programa_id);
    else q = q.is("programa_id", null);
    const { data, error } = await q.select("id");
    if (error) throw error;
    if (data && data.length > 0) return data;
    throw new Error("Logo não encontrada no banco. Recarregue a página e tente novamente.");
  };

  const handleSoftDelete = async (id: string) => {
    const activeUid =
      dataUserId ||
      effectiveUserId ||
      resolveStationUid(dataUserId, effectiveUserId, user) ||
      user?.id ||
      "";
    const target = logos.find((l) => l.id === id);
    const excludedAt = new Date().toISOString();

    try {
      const patch = { excluido: true, excluido_at: excludedAt, ativo: false };
      await updateLogoRecord(target, id, patch, activeUid);
    } catch (e: any) {
      // Logos carregadas pelo XML/snapshot podem ter IDs sintéticos (db_xml_*/snap_*).
      // Nesses casos não existe linha correspondente no banco para atualizar.
      // O registro local deve ser tombstonado para que a logo não volte a aparecer
      // a cada reload enquanto a origem remota estiver sendo reconciliada.
      const isSynthetic = /^db_xml_|^snap_|^logo_/.test(String(id));
      if (!isSynthetic || !target) {
        toast({ title: "Erro ao excluir logo", description: e?.message || String(e), variant: "destructive" });
        return;
      }
    }

    if (activeUid && target) {
      const local = getLocalLogos(activeUid);
      const updated = local.filter((l) => l.id !== id);
      updated.push({ ...target, excluido: true, excluido_at: excludedAt, ativo: false });
      saveLocalLogos(activeUid, updated);
    }

    toast({ title: "Logo movida para Excluídas" });
    await loadData();
  };

  const handleRestore = (logo: Logo) => {
    setRestoreLogo(logo);
    setRestoreProgramaIds(logo.programa_id ? [logo.programa_id] : []);
  };

  const confirmRestore = async () => {
    if (!restoreLogo || restoring) return;
    const activeUid =
      dataUserId ||
      effectiveUserId ||
      resolveStationUid(dataUserId, effectiveUserId, user) ||
      user?.id ||
      "";
    const ids = restoreProgramaIds.length ? restoreProgramaIds : [""];
    const first = ids[0] || null;
    const rest = ids.slice(1).map((v) => v || null);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const restoreDate =
      restoreLogo.data_final && new Date(`${restoreLogo.data_final}T23:59:59`).getTime() >= today.getTime()
        ? restoreLogo.data_final
        : defaultExpiration;

    setRestoring(true);

    try {
      await updateLogoRecord(
        restoreLogo,
        restoreLogo.id,
        { excluido: false, excluido_at: null, ativo: true, programa_id: first, data_final: restoreDate },
        activeUid
      );
    } catch (e: any) {
      setRestoring(false);
      toast({ title: "Erro ao restaurar logo", description: e?.message || String(e), variant: "destructive" });
      return;
    }

    if (activeUid) {
      let local = getLocalLogos(activeUid);
      local = local.map((l) =>
        l.id === restoreLogo.id
          ? { ...l, excluido: false, excluido_at: null, ativo: true, programa_id: first, data_final: restoreDate }
          : l
      );

      if (rest.length) {
        for (const pid of rest) {
          const dupLogo: Logo = {
            ...restoreLogo,
            id: `logo_rst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            user_id: activeUid,
            programa_id: pid,
            data_final: restoreDate,
            ativo: true,
            excluido: false,
            excluido_at: null,
          };
          local.push(dupLogo);
          try {
            await supabase.from("logos_patrocinadores").insert({
              user_id: activeUid,
              programa_id: pid,
              logo_url: restoreLogo.logo_url,
              nome: restoreLogo.nome,
              data_final: restoreDate,
              ativo: true,
              excluido: false,
            });
          } catch (e) {}
        }
      }
      saveLocalLogos(activeUid, local);
    }

    const nomes = ids.map((pid) => (pid ? programas.find((p) => p.id === pid)?.nome || "programa" : "SEM PROGRAMA"));
    const totalLogos = ids.length;
    const logoLabel = totalLogos === 1 ? "1 logo restaurada" : `${totalLogos} logos restauradas`;
    const progLabel = nomes.length === 1 ? "programa" : "programas";
    toast({
      title: logoLabel,
      description: `${progLabel.charAt(0).toUpperCase() + progLabel.slice(1)} selecionado${nomes.length === 1 ? "" : "s"}: ${nomes.join(", ")}`,
    });

    setRestoreLogo(null);
    setRestoreProgramaIds([]);
    setRestoring(false);
    await loadData();
  };

  const handlePermanentDelete = async (id: string) => {
    const activeUid =
      dataUserId ||
      effectiveUserId ||
      resolveStationUid(dataUserId, effectiveUserId, user) ||
      user?.id ||
      "";
    try {
      const { data, error } = await supabase.from("logos_patrocinadores").delete()
        .eq("id", id).eq("user_id", activeUid).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("O banco não confirmou a exclusão permanente.");
      if (activeUid) {
        const local = getLocalLogos(activeUid).filter((l) => l.id !== id);
        saveLocalLogos(activeUid, local);
      }
      await loadData();
    } catch (e: any) {
      toast({ title: "Não foi possível excluir a logo", description: e?.message || "Falha ao excluir no servidor.", variant: "destructive" });
    }
  };

  const startEditDate = (logo: Logo) => {
    setEditingLogoId(logo.id);
    setEditDate(logo.data_final);
  };

  const saveEditDate = async () => {
    if (!editingLogoId || !editDate) return;
    const activeUid =
      dataUserId ||
      effectiveUserId ||
      resolveStationUid(dataUserId, effectiveUserId, user) ||
      user?.id ||
      "";
    try {
      const { data, error } = await supabase.from("logos_patrocinadores")
        .update({ data_final: editDate, ativo: true })
        .eq("id", editingLogoId).eq("user_id", activeUid).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("O banco não confirmou a alteração da validade.");
      if (activeUid) {
        const local = getLocalLogos(activeUid).map((l) =>
          l.id === editingLogoId ? { ...l, data_final: editDate, ativo: true } : l
        );
        saveLocalLogos(activeUid, local);
      }
      toast({ title: "Validade atualizada!" });
      setEditingLogoId(null);
      setEditDate("");
      await loadData();
    } catch (e: any) {
      toast({ title: "Validade não foi atualizada", description: e?.message || "Falha ao atualizar no servidor.", variant: "destructive" });
    }
  };

  // Drag handlers for restoring excluded logos
  const handleDragStart = (logo: Logo) => {
    dragItem.current = logo;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("ring-2", "ring-blue-400");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("ring-2", "ring-blue-400");
  };

  const copyLogoToPrograma = async (logo: Logo, targetProgramaId: string) => {
    if (!targetProgramaId || targetProgramaId === logo.programa_id) return;
    const activeUid =
      dataUserId ||
      effectiveUserId ||
      resolveStationUid(dataUserId, effectiveUserId, user) ||
      user?.id ||
      "";
    const copyId = `logo_copy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const copyLogo: Logo = {
      ...logo,
      id: copyId,
      user_id: activeUid,
      programa_id: targetProgramaId,
      ativo: true,
      excluido: false,
      excluido_at: null,
      created_at: new Date().toISOString(),
    };

    try {
      const { data: insData, error } = await supabase.from("logos_patrocinadores").insert({
        user_id: activeUid,
        programa_id: targetProgramaId,
        logo_url: logo.logo_url,
        nome: logo.nome,
        data_final: logo.data_final,
        ativo: true,
        excluido: false,
      }).select().maybeSingle();
      if (!error && insData?.id) {
        copyLogo.id = insData.id;
      }
    } catch (e) {
      console.warn("[copyLogoToPrograma] Supabase insert notice:", e);
    }

    if (activeUid) {
      const local = getLocalLogos(activeUid);
      saveLocalLogos(activeUid, [copyLogo, ...local]);
    }

    toast({ title: "Logo copiada com sucesso" });
    await loadData();
  };

  const handleDrop = async (e: React.DragEvent, targetProgramaId?: string) => {
    e.preventDefault();
    e.currentTarget.classList.remove("ring-2", "ring-blue-400");
    const item = dragItem.current;
    if (!item) return;
    if (item.excluido) {
      await handleRestore(item);
    } else if (targetProgramaId) {
      await copyLogoToPrograma(item, targetProgramaId);
    }
    dragItem.current = null;
  };

  const [copyPrompt, setCopyPrompt] = useState<{ logo: Logo; programa: Programa } | null>(null);

  const handleProgramaContextMenu = (e: React.MouseEvent, programa: Programa) => {
    const item = dragItem.current;
    if (!item || item.excluido) return;
    if (item.programa_id === programa.id) return;
    e.preventDefault();
    setCopyPrompt({ logo: item, programa });
  };

  const confirmCopyPrompt = async () => {
    if (!copyPrompt) return;
    await copyLogoToPrograma(copyPrompt.logo, copyPrompt.programa.id);
    dragItem.current = null;
    setCopyPrompt(null);
  };

  const sortedProgramas = useMemo(() => {
    return [...programas]
      .filter((p) => !isExcludedStudio(p.estudio))
      .sort((a, b) => (a.horario_inicio || "99:99").localeCompare(b.horario_inicio || "99:99"));
  }, [programas]);

  // Normaliza o rótulo do estúdio para exibição/agrupamento (traz TODOS os estúdios)
  const normalizeEstudio = (raw?: string | null) => {
    const s = (raw || "").trim();
    if (!s) return "Sem estúdio";
    if (/podcast/i.test(s)) return "Estúdio Podcast";
    if (/fm/i.test(s)) return "Estúdio FM";
    if (/news|redação|redacao/i.test(s)) return "Redação / Newsroom";
    return s;
  };
  const estudioIcon = (label: string) => {
    if (/podcast/i.test(label)) return "🎙️";
    if (/fm/i.test(label)) return "📻";
    if (/news|redação|redacao/i.test(label)) return "📰";
    if (/sem estúdio/i.test(label)) return "📦";
    return "🎬";
  };
  const estudioColor = (label: string) => {
    if (/podcast/i.test(label)) return "#8B5CF6";
    if (/fm/i.test(label)) return "#0055ff";
    if (/news|redação|redacao/i.test(label)) return "#F59E0B";
    return "#64748B";
  };

  // Agrupa dinamicamente por estúdio (qualquer estúdio existente, ocultando programas/seções com 0 logos)
  const groupedByStudio = useMemo(() => {
    const map = new Map<string, { programa: Programa; logos: Logo[] }[]>();
    sortedProgramas.forEach((p) => {
      if (isExcludedStudio(p.estudio)) return;
      const key = normalizeEstudio(p.estudio);
      if (isExcludedStudio(key)) return;
      const gLogos = logos.filter(
        (l) =>
          (l.programa_id === p.id ||
            l.programa_id === p.nome ||
            normalizeProgName(l.programa_id) === normalizeProgName(p.nome) ||
            normalizeProgName(l.programa_id) === normalizeProgName(p.id) ||
            normalizeProgName((l as any).programa_nome) === normalizeProgName(p.nome) ||
            normalizeProgName((l as any).programa_nome) === normalizeProgName(p.id)) &&
          l.ativo
      );
      // Exclui seções onde o número de logos cadastradas for = 0
      if (gLogos.length === 0) return;

      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ programa: p, logos: gLogos });
    });
    // Ordem preferida: FM primeiro, depois Podcast, depois demais alfabético
    const order = (label: string) =>
      /fm/i.test(label) ? 0 : /podcast/i.test(label) ? 1 : /news|redação|redacao/i.test(label) ? 2 : /geral/i.test(label) ? 9 : 3;
    return Array.from(map.entries())
      .filter(([label, items]) => !isExcludedStudio(label) && items.length > 0)
      .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
      .map(([label, items]) => ({
        label,
        items: items.filter((item) => !isExcludedStudio(item.programa.estudio) && item.logos.length > 0),
      }))
      .filter((section) => section.items.length > 0);
  }, [sortedProgramas, logos, programas]);

  const groupedExcluded = programas
    .map((p) => ({
      programa: p,
      logos: excludedLogos.filter(
        (l) =>
          l.programa_id === p.id ||
          l.programa_id === p.nome ||
          normalizeProgName(l.programa_id) === normalizeProgName(p.nome) ||
          normalizeProgName(l.programa_id) === normalizeProgName(p.id) ||
          normalizeProgName((l as any).programa_nome) === normalizeProgName(p.nome) ||
          normalizeProgName((l as any).programa_nome) === normalizeProgName(p.id)
      ),
    }))
    .filter((g) => g.logos.length > 0);

  if (loading) {
    return (
      <div className="nexo-scope">
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-transparent overflow-hidden">
          <div className="h-full animate-pulse rounded-r" style={{ width: "60%", background: "var(--layout-accent-color, #e53e3e)", animation: "loadbar 1.2s ease-in-out infinite" }} />
        </div>
        <style>{`@keyframes loadbar { 0% { width: 10%; margin-left: 0; } 50% { width: 60%; margin-left: 20%; } 100% { width: 10%; margin-left: 90%; } }`}</style>
        <ModulePageSkeleton variant="form" />
      </div>
    );
  }

  return (
    <div className="nexo-scope space-y-4 animate-fade-in max-w-6xl mx-auto w-full">
      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        ADS — Logos Patrocinadores
      </div>
      <div
        className="rounded-3xl p-6 lg:p-8"
        style={{
          background: "#ffffff",
          borderRadius: 24,
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.03)",
          border: "1px solid rgba(226, 232, 240, 0.9)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3.5 mb-6">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
            style={{ backgroundColor: "#0055ff", color: "#ffffff" }}
          >
            <Upload size={20} />
          </div>
          <div>
            <h3 className="text-lg font-black uppercase tracking-wider" style={{ color: "#002132", margin: 0 }}>
              Logos de Patrocinadores
            </h3>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Gerencie as marcas e logos vinculadas aos programas da emissora
            </p>
          </div>
        </div>

        {/* Form */}
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="rounded-2xl overflow-hidden mb-6 bg-white"
          style={{
            border: "1px solid rgba(226, 232, 240, 0.9)",
            boxShadow: "0 2px 16px rgba(0, 0, 0, 0.02)",
          }}
        >
          <div
            className="px-6 py-4 flex items-center justify-between border-b border-slate-100"
            style={{ backgroundColor: "#f8fafc" }}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#0055ff]" />
              <h4 className="text-xs font-black uppercase tracking-wider text-[#002132]">
                {editingFullId ? "Editar Logo de Patrocinador" : "Nova Logo de Patrocinador"}
              </h4>
            </div>
            {editingFullId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-bold text-slate-500 hover:text-red-500 transition-colors"
              >
                Cancelar edição
              </button>
            )}
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                {editingFullId && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Nome *</label>
                    <input
                      type="text"
                      value={nomeLogo}
                      onChange={(e) => setNomeLogo(e.target.value)}
                      placeholder="Ex: Patrocinador X"
                      className="w-full px-5 py-2.5 text-xs font-bold uppercase outline-none rounded-full bg-[#f8fafc] border border-slate-200/90 text-[#002132] focus:border-[#0055ff] focus:ring-2 focus:ring-[#0055ff]/15 transition-all"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Programa(s) * {!editingFullId && programaIds.length > 0 && <span className="font-normal opacity-60">({programaIds.length} selecionado{programaIds.length > 1 ? "s" : ""})</span>}
                  </label>
                  {editingFullId ? (
                    <select
                      value={programaId}
                      onChange={(e) => setProgramaId(e.target.value)}
                      className="w-full px-5 py-2.5 text-xs font-bold outline-none rounded-full bg-[#f8fafc] border border-slate-200/90 text-[#002132] focus:border-[#0055ff] focus:ring-2 focus:ring-[#0055ff]/15 cursor-pointer uppercase transition-all"
                    >
                      <option value="">Selecione um programa</option>
                      <option value="__none__">— SEM PROGRAMA —</option>
                      {programas.map((p) => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="relative" ref={programaPickerRef}>
                      <button
                        ref={programaTriggerRef}
                        type="button"
                        onClick={() => setProgramaPickerOpen((v) => !v)}
                        className="w-full px-5 py-2.5 text-xs font-bold outline-none text-left flex items-center justify-between rounded-full bg-[#f8fafc] border border-slate-200/90 text-[#002132] hover:border-[#0055ff] focus:border-[#0055ff] focus:ring-2 focus:ring-[#0055ff]/15 transition-all"
                      >
                        <span className="truncate">
                          {programaIds.length === 0
                            ? "Selecione um ou mais programas"
                            : programaIds
                                .map((id) => id === "__none__" ? "SEM PROGRAMA" : programas.find((p) => p.id === id)?.nome)
                                .filter(Boolean)
                                .join(", ")}
                        </span>
                        <ChevronDown size={14} className="opacity-60 shrink-0 ml-2" />
                      </button>
                      {programaPickerOpen && programaPickerPos && createPortal(
                        <div
                          ref={programaPortalRef}
                          className="fixed rounded-2xl shadow-2xl overflow-hidden bg-white border border-slate-200"
                          style={{
                            top: programaPickerPos.top,
                            left: programaPickerPos.left,
                            width: programaPickerPos.width,
                            zIndex: 9999,
                          }}
                        >
                          <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                            <div className="relative">
                              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                autoFocus
                                value={programaSearch}
                                onChange={(e) => setProgramaSearch(e.target.value)}
                                placeholder="Buscar programa..."
                                className="w-full pl-9 pr-3 py-2 text-xs font-bold outline-none rounded-full bg-white border border-slate-200 text-[#002132] focus:border-[#0055ff]"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50/30">
                            <div className="flex gap-3">
                              <button type="button" onClick={() => setProgramaIds(programas.map((p) => p.id))} className="text-[11px] font-bold text-[#0055ff] hover:underline">
                                Todos
                              </button>
                              <button type="button" onClick={() => setProgramaIds([])} className="text-[11px] font-bold text-slate-500 hover:text-slate-800">
                                Limpar
                              </button>
                            </div>
                            <span className="text-[10px] font-semibold text-slate-400">
                              {programaIds.length} selecionado{programaIds.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="max-h-72 overflow-auto p-1.5">
                            {"sem programa".includes(programaSearch.toLowerCase()) && (
                              <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50 rounded-xl transition-colors border-b border-slate-100">
                                <input
                                  type="checkbox"
                                  checked={programaIds.includes("__none__")}
                                  onChange={(e) =>
                                    setProgramaIds((prev) => (e.target.checked ? [...prev, "__none__"] : prev.filter((x) => x !== "__none__")))
                                  }
                                  className="accent-[#0055ff] w-4 h-4 rounded"
                                />
                                <span className="text-xs font-black uppercase text-[#002132] flex-1 truncate">— Sem Programa —</span>
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-slate-100 text-slate-600">Geral</span>
                              </label>
                            )}
                            {programas
                              .filter((p) => p.nome.toLowerCase().includes(programaSearch.toLowerCase()))
                              .map((p) => {
                                const checked = programaIds.includes(p.id);
                                return (
                                  <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50 rounded-xl transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) =>
                                        setProgramaIds((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)))
                                      }
                                      className="accent-[#0055ff] w-4 h-4 rounded"
                                    />
                                    <span className="text-xs font-bold text-[#002132] flex-1 truncate">{p.nome}</span>
                                    <span
                                      className="text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                                      style={{
                                        background: `${estudioColor(normalizeEstudio(p.estudio))}15`,
                                        color: estudioColor(normalizeEstudio(p.estudio)),
                                      }}
                                    >
                                      {estudioIcon(normalizeEstudio(p.estudio))} {normalizeEstudio(p.estudio)}
                                    </span>
                                  </label>
                                );
                              })}
                            {programas.filter((p) => p.nome.toLowerCase().includes(programaSearch.toLowerCase())).length === 0 && (
                              <div className="px-3 py-6 text-xs text-slate-400 text-center font-medium">Nenhum programa encontrado</div>
                            )}
                          </div>
                          <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                            <button
                              type="button"
                              onClick={() => { setProgramaPickerOpen(false); setProgramaSearch(""); }}
                              className="w-full py-2 text-xs font-black uppercase tracking-wider rounded-full text-white transition-all hover:brightness-110 shadow-xs"
                              style={{ backgroundColor: "#0055ff" }}
                            >
                              Concluir
                            </button>
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Data de Expiração *</label>
                  <DateInput
                                      value={dataFinal}
                    onChange={(e) => setDataFinal(e.target.value)}
                    required
                    className="w-full px-5 py-2.5 text-xs font-bold outline-none rounded-full bg-[#f8fafc] border border-slate-200/90 text-[#002132] focus:border-[#0055ff] focus:ring-2 focus:ring-[#0055ff]/15 transition-all"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="h-11 px-8 rounded-full font-black text-xs uppercase tracking-widest text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(0,85,255,0.28)]"
                    style={{ backgroundColor: "#0055ff" }}
                  >
                    {saving ? <><Loader2 className="animate-spin" size={14} /> Salvando...</> : editingFullId ? "Atualizar Logo" : `Salvar ${pendingFiles.length} logo(s)`}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Logo {editingFullId ? "" : "*"} <span className="font-normal text-slate-400">(1080×1080, fundo transparente)</span>
                </label>
                <div className="flex flex-wrap gap-3">
                  {existingLogoUrl && pendingFiles.length === 0 && (
                    <div className="relative group">
                      <img
                        src={resolveSponsorLogoUrl(existingLogoUrl, editingFullId ? logos.find(l => l.id === editingFullId)?.nome : "")}
                        alt=""
                        className="w-20 h-20 rounded-2xl object-contain p-2 bg-black border border-slate-800"
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          target.onerror = null;
                          target.src = "/default-sponsor-logo.png";
                        }}
                      />
                      <span className="text-[9px] font-bold text-slate-400 text-center block mt-1 uppercase">Atual</span>
                    </div>
                  )}
                  {pendingFiles.map((pf, idx) => (
                    <div key={idx} className="relative group flex flex-col items-center w-24">
                      <img src={pf.preview} alt="" className="w-20 h-20 rounded-2xl object-contain p-2 border border-slate-800 bg-black" />
                      <button
                        type="button"
                        onClick={() => removePendingFile(idx)}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-sm hover:scale-110 transition-transform"
                      >
                        ×
                      </button>
                      {!editingFullId && (
                        <input
                          type="text"
                          value={pf.nome}
                          onChange={(e) => updatePendingName(idx, e.target.value)}
                          placeholder="Nome"
                          className="w-full mt-1.5 px-2 py-1 text-[10px] uppercase font-bold rounded-lg outline-none text-center bg-[#f8fafc] border border-slate-200 text-[#002132] focus:border-[#0055ff]"
                        />
                      )}
                    </div>
                  ))}
                  <label
                    className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all bg-[#f8fafc] border-2 border-dashed border-slate-200 hover:border-[#0055ff] hover:bg-blue-50/40 group shrink-0"
                  >
                    <Plus size={18} className="text-slate-400 group-hover:text-[#0055ff] transition-colors" />
                    <span className="text-[10px] font-bold text-slate-400 group-hover:text-[#0055ff] mt-1 transition-colors">Adicionar</span>
                    <input type="file" accept="image/png" multiple={!editingFullId} className="hidden" onChange={handleAddFile} />
                  </label>

                  {/* AJUSTAR LOGO - Habilitado apenas quando o usuário selecionar um programa */}
                  <button
                    type="button"
                    disabled={!isProgramSelected}
                    onClick={() => {
                      if (!isProgramSelected) return;
                      clientLogoInputRef.current?.click();
                    }}
                    className={`group/ajustar h-[72px] min-w-[154px] px-4 rounded-xl flex flex-row gap-2.5 items-center justify-center cursor-pointer transition-colors select-none shrink-0 border ${
                      isProgramSelected
                        ? "bg-white border-[#d6e0ed] text-[#0055ff] hover:bg-blue-50"
                        : "bg-[#f8fafc] border-slate-200 text-slate-400 cursor-not-allowed opacity-50"
                    }`}
                    title={
                      isProgramSelected
                        ? "Ajustar Logo"
                        : "Selecione um programa para habilitar o ajuste da logo"
                    }
                  >
                    <Settings2 size={18} />
                    <span className="text-[11px] font-bold uppercase tracking-wide leading-tight">Ajustar Logo</span>
                    <input
                      ref={clientLogoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf,.pdf"
                      className="hidden"
                      onChange={handleClientLogoSelected}
                    />
                  </button>
                </div>
                {!editingFullId && pendingFiles.length > 0 && (
                  <p className="text-[11px] font-medium text-slate-400 mt-2">
                    O nome de cada logo foi extraído do arquivo. Você pode editar individualmente acima.
                  </p>
                )}
              </div>
            </div>
          </div>
        </form>

        {/* Excluded Logos - right after form */}
        <Collapsible open={excluidasOpen} onOpenChange={setExcluidasOpen}>
          <div className="rounded-2xl overflow-hidden mb-6 border border-slate-200/80 bg-white shadow-sm">
            <CollapsibleTrigger asChild>
              <button className="w-full px-5 py-3.5 flex items-center justify-between cursor-pointer bg-slate-50 hover:bg-slate-100/80 transition-colors">
                <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2 text-slate-700">
                  <Trash2 size={15} className="text-slate-500" />
                  Logos Excluídas
                  {excludedLogos.length > 0 && (
                    <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{excludedLogos.length}</span>
                  )}
                </h3>
                <div className="flex items-center gap-3">
                  {excluidasOpen && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={excluidasSearch}
                          onChange={(e) => setExcluidasSearch(e.target.value)}
                          placeholder="Buscar logo..."
                          className="pl-8 pr-3 py-1.5 text-[11px] rounded-full outline-none w-44 bg-white border border-slate-200 text-[#002132] focus:border-[#0055ff] transition-all shadow-sm"
                        />
                      </div>
                    </div>
                  )}
                  <ChevronDown size={18} className={`transition-transform duration-200 text-slate-500 ${excluidasOpen ? "rotate-180" : ""}`} />
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {(() => {
                const filtered = excludedLogos.filter((l) => {
                  if (!excluidasSearch) return true;
                  const q = excluidasSearch.toLowerCase();
                  return (l.nome || "").toLowerCase().includes(q);
                });
                return filtered.length === 0 ? (
                  <p className="text-xs font-medium py-8 text-center text-slate-400">
                    {excludedLogos.length === 0 ? "Nenhuma logo excluída." : "Nenhuma logo encontrada."}
                  </p>
                ) : (
                <div className="p-5 bg-white">
                  <p className="text-[11px] font-medium text-slate-600 mb-4">
                    Arraste uma logo para um programa para restaurá-la, ou clique no botão de restaurar.
                    <br /><span className="text-slate-400 text-[10px]">Logos excluídas são mantidas por até 180 dias.</span>
                  </p>
                  <div className="flex flex-wrap gap-4">
                    {filtered.map((logo) => {
                      const refDate = logo.excluido_at ? new Date(logo.excluido_at) : (logo.data_final ? new Date(logo.data_final + "T23:59:59") : null);
                      const diasRestantes = refDate ? Math.max(0, 180 - Math.ceil((Date.now() - refDate.getTime()) / 86400000)) : 0;
                      const isExpiredOnly = !logo.excluido;
                      return (
                        <div key={logo.id} className="w-24 space-y-1.5 text-center opacity-85 hover:opacity-100 transition-all cursor-grab"
                          draggable
                          onDragStart={() => handleDragStart(logo)}
                        >
                          <div
                            className="sponsor-deleted-logo-box relative group rounded-2xl border border-slate-700 shadow-sm overflow-hidden"
                            data-nexo-skip
                          >
                            <img
                              src={resolveSponsorLogoUrl(logo.logo_url, logo.nome)}
                              alt={logo.nome}
                              className="w-full aspect-square object-contain p-2.5 bg-transparent"
                              onError={(e) => {
                                const target = e.currentTarget as HTMLImageElement;
                                target.onerror = null;
                                target.src = "/default-sponsor-logo.png";
                              }}
                            />
                            <div className="absolute inset-0 rounded-2xl flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 backdrop-blur-[2px]">
                              <button onClick={() => handleRestore(logo)} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-md transition-transform hover:scale-110" title="Restaurar">
                                <RotateCcw size={13} />
                              </button>
                              <button onClick={() => handlePermanentDelete(logo.id)} className="bg-rose-500 hover:bg-rose-600 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-md transition-transform hover:scale-110" title="Excluir permanentemente">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                          {logo.nome && (
                            <p className="text-[11px] font-bold text-slate-700 truncate">{logo.nome}</p>
                          )}
                          <span className="text-[9px] font-medium text-slate-400 block">{isExpiredOnly ? "vencida • " : ""}{diasRestantes}d para expirar</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })()}
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Renderiza uma seção por estúdio (dinâmico — todos os estúdios existentes) */}
        {groupedByStudio.map(section => {
          const color = estudioColor(section.label);
          const icon = estudioIcon(section.label);
          const totalLogos = section.items.reduce((sum, g) => sum + g.logos.length, 0);
          return (
          <div key={section.label} className="mb-8">
            <div
              className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-2xl border"
              style={{
                backgroundColor: "#ffffff",
                borderColor: "rgba(226, 232, 240, 0.9)",
                borderLeft: `4px solid ${color}`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
              }}
            >
              <span
                className="flex items-center justify-center rounded-xl text-sm"
                style={{ width: 32, height: 32, background: `${color}15`, color }}
              >
                {icon}
              </span>
              <h2
                className="text-xs font-black uppercase tracking-wider text-[#002132]"
              >
                {section.label}
              </h2>
              <span
                className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                style={{ background: color, color: "#fff" }}
              >
                {section.items.length} {section.items.length === 1 ? "programa" : "programas"}
              </span>
              <span
                className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                style={{ background: `${color}15`, color }}
              >
                {totalLogos} {totalLogos === 1 ? "logo" : "logos"}
              </span>
            </div>
            <div className="space-y-3">
              {section.items.map(({ programa, logos: gLogos }) => (
                <Collapsible key={programa.id} defaultOpen={false}>
                  <div className="rounded-2xl overflow-hidden border border-slate-200/80 bg-white shadow-sm transition-all"
                    onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, programa.id)}
                    onContextMenu={(e) => handleProgramaContextMenu(e, programa)}
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        className="w-full px-5 py-3.5 flex items-center justify-between cursor-pointer text-white transition-all hover:brightness-105 active:scale-[0.99] [&[data-state=open]>svg]:rotate-180"
                        style={{
                          background: `linear-gradient(90deg, ${color} 0%, color-mix(in srgb, ${color} 80%, #000) 100%)`,
                        }}
                      >
                        <h3 className="text-xs font-black uppercase flex items-center gap-2.5 tracking-wide text-white">
                          {programa.horario_inicio && (
                            <span className="text-[10px] font-mono font-bold bg-black/25 backdrop-blur-sm px-2.5 py-0.5 rounded-full">
                              {programa.horario_inicio.slice(0,5)}
                            </span>
                          )}
                          {programa.nome}
                          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
                            {gLogos.length}
                          </span>
                        </h3>
                        <ChevronDown size={18} className="transition-transform duration-200 text-white" />
                      </button>
                    </CollapsibleTrigger>

                    {copyPrompt && copyPrompt.programa.id === programa.id && (
                      <div className="px-5 py-3 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-xs font-medium text-[#002132]">
                          Deseja copiar a logo <strong className="font-bold">"{copyPrompt.logo.nome}"</strong> para este programa?
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => setCopyPrompt(null)}
                            className="px-4 py-1.5 text-xs font-bold rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer">
                            Cancelar
                          </button>
                          <button onClick={confirmCopyPrompt}
                            className="px-4 py-1.5 text-xs font-bold rounded-full text-white bg-[#0055ff] hover:bg-blue-600 transition-colors shadow-sm cursor-pointer">
                            Copiar
                          </button>
                        </div>
                      </div>
                    )}
                    <CollapsibleContent>
                      <div className="p-4 sm:p-5">
                        {gLogos.length === 0 ? (
                          <div className="py-6 px-4 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                            <p className="text-xs font-bold text-slate-600">Nenhuma logo vinculada a este programa.</p>
                            <p className="text-[11px] font-medium text-slate-400 mt-1">Arraste uma logo de outro programa ou adicione acima para vincular.</p>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-4 items-start">
                            {gLogos.map((logo) => {
                              const diasRestantes = Math.ceil((new Date(logo.data_final + "T23:59:59").getTime() - Date.now()) / 86400000);
                              return (
                                <div
                                  key={logo.id}
                                  className="w-28 space-y-2 text-center cursor-grab active:cursor-grabbing shrink-0"
                                  draggable
                                  onDragStart={() => handleDragStart(logo)}
                                  onMouseDown={() => { dragItem.current = logo; }}
                                  title="Arraste para outro programa para copiar (ou clique e use o botão direito no programa de destino)"
                                >
                                  <div className="relative group rounded-2xl overflow-visible border border-slate-800 bg-black hover:border-[#0055ff]/50 transition-all shadow-sm">
                                    <img
                                      src={sponsorLogoSrc(logo.logo_url, logo.nome)}
                                      alt={logo.nome}
                                      className="w-full aspect-square object-contain p-2.5 bg-black transition-transform group-hover:scale-105"
                                      onError={(e) => {
                                        const target = e.currentTarget as HTMLImageElement;
                                        target.onerror = null;
                                        target.src = MISSING_LOGO_PLACEHOLDER;
                                      }}
                                    />
                                    <div className="absolute left-[calc(100%+8px)] top-0 z-[100] flex w-28 flex-col rounded-xl border border-slate-200 bg-white p-1 shadow-[0_8px_24px_rgba(15,23,42,0.18)] opacity-0 invisible translate-x-1 group-hover:opacity-100 group-hover:visible group-hover:translate-x-0 group-focus-within:opacity-100 group-focus-within:visible transition-all duration-150">
                                      <button type="button" onClick={(e) => { e.stopPropagation(); dragItem.current = logo; toast({ title: "Logo selecionada", description: "Clique com o botão direito no programa de destino para copiar." }); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[10px] font-semibold text-slate-700 hover:bg-blue-50 hover:text-[#0055ff] transition-colors" title="Copiar para outro programa"><Copy size={13} /><span>Copiar</span></button>
                                      <button type="button" onClick={(e) => { e.stopPropagation(); handleSoftDelete(logo.id); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[10px] font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-600 transition-colors" title="Deletar logo"><Trash2 size={13} /><span>Deletar</span></button>
                                      <button type="button" onClick={(e) => { e.stopPropagation(); startAdjustLogo(logo); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[10px] font-semibold text-slate-700 hover:bg-slate-100 hover:text-[#0055ff] transition-colors" title="Converter para flat branco com fundo transparente"><Settings2 size={13} /><span>Ajustar logo</span></button>
                                    </div>
                                  </div>
                                  {logo.nome && (
                                    <p className="text-[11px] font-bold text-[#002132] truncate">
                                      {logo.nome}
                                    </p>
                                  )}
                                  <span
                                    className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                      diasRestantes <= 7 ? "bg-rose-50 text-rose-600 border border-rose-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    }`}
                                  >
                                    {diasRestantes > 0 ? `${diasRestantes}d restantes` : "Expirando"}
                                  </span>

                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          </div>
          );
        })}
      </div>

      {restoreLogo && createPortal(
        <div
          onClick={() => { if (!restoring) setRestoreLogo(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 2147483001, background: "rgba(0, 33, 50, 0.45)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "Montserrat, sans-serif" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 460, overflow: "hidden", boxShadow: "0 24px 60px rgba(0, 33, 50, 0.2)", border: "1px solid rgba(226, 232, 240, 0.9)" }}
          >
            <div style={{ background: "linear-gradient(135deg, #0055ff 0%, #0044cc 100%)", padding: "18px 24px", color: "#fff", fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em" }}>
              Restaurar Logo
            </div>
            <div style={{ padding: 24, background: "#f8fafc" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                <div style={{ width: 84, height: 84, borderRadius: 18, background: "#0f172a", border: "1px solid #1e293b", boxShadow: "0 8px 20px rgba(0, 0, 0, 0.12)", padding: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <img
                    src={resolveSponsorLogoUrl(restoreLogo.logo_url, restoreLogo.nome)}
                    alt={restoreLogo.nome || "Logo"}
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      target.onerror = null;
                      target.src = "/default-sponsor-logo.png";
                    }}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ color: "#64748b", fontSize: 10, fontWeight: 900, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Logo selecionada</p>
                  <p style={{ color: "#002132", fontSize: 16, fontWeight: 900, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{restoreLogo.nome || "Sem nome"}</p>
                  <p style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, margin: "4px 0 0" }}>Fundo escuro para conferir contraste e transparência.</p>
                </div>
              </div>
              <p style={{ color: "#002132", fontSize: 12, fontWeight: 700, margin: "0 0 10px" }}>
                Escolha um ou mais programas para restaurar a logo{restoreLogo.nome ? ` "${restoreLogo.nome}"` : ""}:
              </p>
              <div style={{ maxHeight: 240, overflowY: "auto", background: "#fff", border: "1px solid rgba(226, 232, 240, 0.9)", borderRadius: 16, padding: 8, boxShadow: "inset 0 1px 3px rgba(0,0,0,0.02)" }}>
                {(() => {
                  const opts = [{ id: "", nome: "— SEM PROGRAMA —" }, ...[...programas].sort((a, b) => a.nome.localeCompare(b.nome))];
                  return opts.map((p) => {
                    const checked = restoreProgramaIds.includes(p.id);
                    return (
                      <label key={p.id || "none"} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, cursor: "pointer", background: checked ? "#eff6ff" : "transparent", color: checked ? "#0055ff" : "#002132", fontSize: 12, fontWeight: checked ? 700 : 600, fontFamily: "Montserrat, sans-serif", transition: "all 0.15s ease" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setRestoreProgramaIds((prev) => e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id));
                          }}
                          style={{ accentColor: "#0055ff", width: 16, height: 16, cursor: "pointer" }}
                        />
                        {p.nome}
                      </label>
                    );
                  });
                })()}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", padding: "16px 24px", background: "#fff", borderTop: "1px solid rgba(226, 232, 240, 0.8)" }}>
              <button
                type="button"
                onClick={() => setRestoreLogo(null)}
                disabled={restoring}
                style={{ padding: "8px 20px", borderRadius: 999, border: "1px solid #cbd5e1", background: "#fff", color: "#475569", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer", fontFamily: "Montserrat, sans-serif", transition: "all 0.15s ease" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmRestore}
                disabled={restoring}
                style={{ padding: "8px 22px", borderRadius: 999, border: "none", background: restoring ? "#93c5fd" : "#0055ff", color: "#ffffff", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", cursor: restoring ? "wait" : "pointer", fontFamily: "Montserrat, sans-serif", boxShadow: "0 4px 14px rgba(0, 85, 255, 0.25)", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {restoring && <Loader2 className="animate-spin" size={14} />}
                {restoring ? "Restaurando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Transformação Automática com IA */}
      {transformModalOpen && (
        <Suspense fallback={null}>
          <LogoTransformModal
            isOpen={transformModalOpen}
            onClose={() => {
              setTransformModalOpen(false);
              setClientSelectedFile(null);
              setAdjustTarget(null);
            }}
            initialFile={clientSelectedFile}
            programas={programas}
            defaultExpirationDate={adjustTarget?.data_final || dataFinal || defaultExpiration}
            preselectedProgramIds={adjustTarget ? [adjustTarget.programa_id || "__none__"] : editingFullId ? [programaId] : programaIds}
            autoSave={!!adjustTarget}
            onApproveAndSave={handleApproveAndSaveAiLogo}
          />
        </Suspense>
      )}    </div>
  );
}
