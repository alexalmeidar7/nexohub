import { useState, useEffect, useRef, Suspense } from "react";
import { Radio, ChevronRight, Clock, Loader2, ArrowRight, Mic, Music, User } from "lucide-react";
import { getApresentadores } from "./ApresentadorForm";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { lazyRetry } from "@/lib/lazyRetry";
import { getClientHouseMixProgramsSync } from "@/lib/houseMixProgramasService";
import { resolvePresenterForProgram } from "@/lib/onAirPresenterResolver";

const DashboardGradeDialog = lazyRetry(() => import("./DashboardGradeDialog"));

export interface Programa {
  id: string;
  nome: string;
  apresentadorId: string;
  apresentadoresIds: string[];
  selo: string;
  diasSemana: string[];
  horarioInicio: string;
  horarioFim: string;
  estudio: string;
  classificacaoEtaria: string;
}

const DIAS_MAP: Record<number, string> = {
  1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo",
};

import { fetchStationDatabaseData, getStationDatabaseSync } from "@/lib/stationDatabaseService";

export function getProgramasSync(userId?: string, userEmail?: string | null): Programa[] {
  const syncData = getStationDatabaseSync(userId || userEmail);
  if (syncData?.programas && syncData.programas.length > 0) {
    return syncData.programas.map(p => ({
      id: p.id,
      nome: p.nome,
      apresentadorId: p.apresentador_id || "",
      apresentadoresIds: p.apresentadores_ids || [],
      selo: p.selo || p.thumb || p.capa || "",
      diasSemana: p.dias_semana || [],
      horarioInicio: p.horario_inicio,
      horarioFim: p.horario_fim,
      estudio: p.estudio || "",
      classificacaoEtaria: p.classificacao_etaria || "Livre",
    }));
  }
  const clientAcc = findClientAccountById(userId) || findClientAccountByEmail(userEmail);
  const fallback = getClientHouseMixProgramsSync(clientAcc?.id, clientAcc?.email);
  return fallback.map(p => ({

    id: p.id,
    nome: p.nome,
    apresentadorId: p.apresentador_id || "",
    apresentadoresIds: p.apresentadores_ids || [],
    selo: p.selo || p.thumb || p.capa || "",
    diasSemana: p.dias_semana || [],
    horarioInicio: p.horario_inicio,
    horarioFim: p.horario_fim,
    estudio: p.estudio || "",
    classificacaoEtaria: "Livre",
  }));
}

export async function getProgramas(userId?: string, userEmail?: string | null): Promise<Programa[]> {
  try {
    let query = supabase
      .from("programas")
      .select("*, thumb, apresentador_id, apresentadores_ids")
      .eq("ativo", true)
      .ilike("estudio", "%fm%")
      .order("horario_inicio");


    if (userId) query = query.eq("user_id", userId);

    const { data } = await query;
    if (data && data.length > 0) {
      return data.map(p => ({
        id: p.id,
        nome: p.nome,
        apresentadorId: p.apresentador_id || "",
        apresentadoresIds: p.apresentadores_ids || [],
        selo: p.selo || p.thumb || "",
        diasSemana: p.dias_semana || [],
        horarioInicio: p.horario_inicio,
        horarioFim: p.horario_fim,
        estudio: p.estudio || "",
        classificacaoEtaria: p.classificacao_etaria || "",
      }));
    }
  } catch {}

  const stationData = await fetchStationDatabaseData(userId || userEmail);
  if (stationData?.programas && stationData.programas.length > 0) {
    return stationData.programas.map(p => ({
      id: p.id,
      nome: p.nome,
      apresentadorId: p.apresentador_id || "",
      apresentadoresIds: p.apresentadores_ids || [],
      selo: p.selo || p.thumb || p.capa || "",
      diasSemana: p.dias_semana || [],
      horarioInicio: p.horario_inicio,
      horarioFim: p.horario_fim,
      estudio: p.estudio || "",
      classificacaoEtaria: p.classificacao_etaria || "Livre",
    }));
  }

  return getProgramasSync(userId, userEmail);
}

export function findCurrentProgram(programas: Programa[]): { programa: Programa; progress: number } | null {
  const now = new Date();
  const diaAtual = DIAS_MAP[now.getDay()];
  const horaAtual = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  for (const p of programas) {
    if (p.diasSemana.includes(diaAtual) && horaAtual >= p.horarioInicio && horaAtual < p.horarioFim) {
      const [sh, sm] = p.horarioInicio.split(":").map(Number);
      const [eh, em] = p.horarioFim.split(":").map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      const currentMin = now.getHours() * 60 + now.getMinutes();
      const progress = Math.min(100, Math.max(0, ((currentMin - startMin) / (endMin - startMin)) * 100));
      return { programa: p, progress };
    }
  }
  return null;
}

function findNextPrograms(programas: Programa[], count: number): Programa[] {
  const now = new Date();
  const diaAtual = DIAS_MAP[now.getDay()];
  const horaAtual = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const todays = programas
    .filter(p => p.diasSemana.includes(diaAtual) && p.horarioInicio > horaAtual)
    .sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));

  if (todays.length >= count) {
    return todays.slice(0, count);
  }

  const result = [...todays];
  for (let i = 1; i <= 7 && result.length < count; i++) {
    const nextDay = DIAS_MAP[(now.getDay() + i) % 7];
    const dayProgs = programas
      .filter(p => p.diasSemana.includes(nextDay))
      .sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));
    for (const p of dayProgs) {
      if (!result.find(r => r.id === p.id)) {
        result.push(p);
        if (result.length >= count) break;
      }
    }
  }
  return result.slice(0, count);
}

interface ApresentadorInfo {
  nome: string;
  foto: string;
}

function useProgramProgress(inicio?: string, fim?: string): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!inicio || !fim) return 0;

  const [sh = 0, sm = 0, ss = 0] = inicio.split(":").map(Number);
  const [eh = 0, em = 0, es = 0] = fim.split(":").map(Number);
  const nowDate = new Date(now);
  const startDate = new Date(nowDate);
  startDate.setHours(sh, sm, ss, 0);
  const endDate = new Date(nowDate);
  endDate.setHours(eh, em, es, 0);
  if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1);

  const totalMs = endDate.getTime() - startDate.getTime();
  if (totalMs <= 0) return 0;
  const elapsedMs = Math.min(Math.max(nowDate.getTime() - startDate.getTime(), 0), totalMs);
  return (elapsedMs / totalMs) * 100;
}

export interface NextProgramProp {
  foto?: string | null;
  apresentador?: string;
  programa: string;
  inicio: string;
  fim?: string;
}

interface OnAirWidgetProps {
  compact?: boolean;
  nextProgram?: NextProgramProp | null;
  effectiveUserId?: string | null;
}

export default function OnAirWidget({ compact = false, nextProgram, effectiveUserId }: OnAirWidgetProps) {
  const { user } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const initialPrograms = getProgramasSync(targetUserId, user?.email);
  const initialCurrent = findCurrentProgram(initialPrograms);
  const initialNexts = findNextPrograms(initialPrograms, 3);

  const [loading, setLoading] = useState(false);
  const [onAir, setOnAir] = useState<{ programa: Programa; progress: number } | null>(initialCurrent);
  const liveProgress = useProgramProgress(onAir?.programa?.horarioInicio, onAir?.programa?.horarioFim);
  const [apresentadoresAtuais, setApresentadoresAtuais] = useState<ApresentadorInfo[]>(() => {
    const syncData = getStationDatabaseSync(targetUserId || user?.email);
    if (initialCurrent?.programa) {
      const resolved = resolvePresenterForProgram(initialCurrent.programa, syncData?.apresentadores || [], targetUserId || user?.email);
      if (resolved.nome && resolved.nome !== "—") {
        return [{ nome: resolved.nome, foto: resolved.foto, background_url: (resolved as any).background_url || resolved.foto }];
      }
    }
    if (syncData?.currentPresenter) {
      return [{ nome: syncData.currentPresenter.nome, foto: syncData.currentPresenter.foto }];
    }
    return [{ nome: "—", foto: "" }];
  });
  const [apresentadorIndex, setApresentadorIndex] = useState(0);
  const [nextPrograms, setNextPrograms] = useState<Programa[]>(initialNexts);
  const [nextApresentadores, setNextApresentadores] = useState<Record<string, ApresentadorInfo>>(() => {
    const syncData = getStationDatabaseSync(targetUserId || user?.email);
    const apMap: Record<string, ApresentadorInfo> = {};
    initialNexts.forEach(p => {
      const res = resolvePresenterForProgram(p, syncData?.apresentadores || [], targetUserId || user?.email);
      apMap[p.id] = { nome: res.nome || "—", foto: res.foto || "" };
    });
    return apMap;
  });
  const [isHovered, setIsHovered] = useState(false);
  const [musicData, setMusicData] = useState<{ titulo?: string; artista?: string; capa?: string; artista_url?: string }>({} as any);
  const [gradeOpen, setGradeOpen] = useState(false);
  const [isStereo, setIsStereo] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);

  // Publish this widget's card bottom as a CSS var so all Dialog popups
  // on the Home align "logo abaixo do box No Ar".
  useEffect(() => {
    const anchor = anchorRef.current;
    const target = anchor?.parentElement as HTMLElement | null;
    if (!target) return;
    const update = () => {
      const r = target.getBoundingClientRect();
      const bottom = Math.max(0, Math.round(r.bottom));
      const left = Math.max(0, Math.round(r.left));
      
      // Calculate specific offset to match the red line in the user's image (left-most edge of the inner content/photo)
      // Usually the sidebar is 64px, and there's a margin.
      // The user wants it aligned exactly with the "Widgets" and player widget inner line.
      const leftOffset = window.innerWidth < 640 ? "0px" : "12px"; 

      document.documentElement.style.setProperty("--onair-bottom", `${bottom}px`);
      document.documentElement.style.setProperty("--onair-left", `${left}px`);
      document.documentElement.style.setProperty("--onair-left-offset", leftOffset);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(target);
    const onWin = () => update();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    const interval = setInterval(update, 1000);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
      clearInterval(interval);
      document.documentElement.style.removeProperty("--onair-bottom");
      document.documentElement.style.removeProperty("--onair-left");
      document.documentElement.style.removeProperty("--onair-left-offset");
    };
  }, [loading, onAir, isHovered]);


  // Fetch user avatar
  useEffect(() => {
    const uid = targetUserId || user?.id;
    if (!uid) return;
    supabase.from("profiles").select("avatar_url, nome").eq("user_id", uid).maybeSingle()
      .then(({ data }) => {
        if (data?.avatar_url) setUserAvatar(data.avatar_url);
      });
  }, [targetUserId, user]);

  // Fetch stereo from streaming channel
  useEffect(() => {
    const uid = targetUserId || user?.id;
    if (!uid) return;
    supabase.from("streaming_channels").select("is_stereo").eq("user_id", uid).eq("active", true).limit(1).maybeSingle()
      .then(({ data }) => { setIsStereo(!!data?.is_stereo); });
  }, [targetUserId, user]);
  useEffect(() => {
    const update = async () => {
      const uid = targetUserId || user?.id;
      const [programasData, apresentadoresData] = await Promise.all([
        getProgramas(uid, user?.email),
        getApresentadores(uid, user?.email)
      ]);
      
      let filteredProgramas = programasData;
      if (uid) {
        const today = new Date().toISOString().split("T")[0];
        const { data: cancelledEvents } = await supabase
          .from("agenda_eventos")
          .select("programa_id")
          .eq("user_id", uid)
          .eq("data", today)
          .eq("status", "cancelado");
        
        if (cancelledEvents && cancelledEvents.length > 0) {
          const cancelledIds = cancelledEvents.map(e => e.programa_id).filter(Boolean);
          filteredProgramas = programasData.filter(p => !cancelledIds.includes(p.id));
        }
      }

      const current = findCurrentProgram(filteredProgramas);
      setOnAir(current);
      if (current) {
        const resolved = resolvePresenterForProgram(current.programa, apresentadoresData, uid || user?.email);
        if (resolved.nome && resolved.nome !== "—") {
          setApresentadoresAtuais([{ nome: resolved.nome, foto: resolved.foto, background_url: (resolved as any).background_url || resolved.foto }]);
        } else {
          const ids = current.programa.apresentadoresIds && current.programa.apresentadoresIds.length > 0 
            ? current.programa.apresentadoresIds 
            : [current.programa.apresentadorId];
          
          const list = ids
            .map(id => apresentadoresData.find(a => a.id === id))
            .filter(Boolean) as any[];
          
          if (list.length > 0) {
            setApresentadoresAtuais(list);
          } else {
            setApresentadoresAtuais([{ nome: "—", foto: "", background_url: "" }]);
          }
        }
        setApresentadorIndex(0);
      } else if (apresentadoresData.length > 0) {
        setApresentadoresAtuais(apresentadoresData);
      }
      const nexts = findNextPrograms(filteredProgramas, 3);
      setNextPrograms(nexts);
      const apMap: Record<string, ApresentadorInfo> = {};
      nexts.forEach(p => {
        const resNext = resolvePresenterForProgram(p, apresentadoresData, uid || user?.email);
        apMap[p.id] = { nome: resNext.nome || "—", foto: resNext.foto || "" };
      });
      setNextApresentadores(apMap);
      setLoading(false);
    };
    update();
    const interval = setInterval(update, 30 * 1000);
    return () => clearInterval(interval);
  }, [user, targetUserId]);

  // Rotate presenters every 10 seconds if there's more than one
  useEffect(() => {
    if (apresentadoresAtuais.length <= 1) return;
    const interval = setInterval(() => {
      setApresentadorIndex(prev => (prev + 1) % apresentadoresAtuais.length);
    }, 1000); // 10s logic: the user said 10s, but we usually add a bit of buffer or handle transition
    // Note: 1000 is 1s, the user asked for 10s. Fixing to 10000.
    clearInterval(interval);
    const rotationInterval = setInterval(() => {
      setApresentadorIndex(prev => (prev + 1) % apresentadoresAtuais.length);
    }, 10000);
    return () => clearInterval(rotationInterval);
  }, [apresentadoresAtuais]);

  // Pré-carrega a foto e o selo do próximo programa quando restar <= 60s
  // para o programa atual, evitando o "flash vazio" na virada.
  useEffect(() => {
    if (!onAir) return;
    const [eh, em] = onAir.programa.horarioFim.split(":").map(Number);
    const check = () => {
      const now = new Date();
      const endMin = eh * 60 + em;
      const curMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
      const remainingSec = Math.round((endMin - curMin) * 60);
      if (remainingSec <= 60 && remainingSec > -5) {
        const next = nextPrograms[0];
        const foto = next ? nextApresentadores[next.id]?.foto : undefined;
        const selo = next?.selo;
        if (foto) { const img = new Image(); img.src = foto; }
        if (selo) { const img = new Image(); img.src = selo; }
      }
    };
    check();
    const iv = setInterval(check, 5000);
    return () => clearInterval(iv);
  }, [onAir, nextPrograms, nextApresentadores]);

  // Poll music data from per-user localStorage (scoped per user)
  useEffect(() => {
    if (!user?.id) return;
    const key = `masterview_music_data::${user.id}`;
    const readMusic = async () => {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          const { matchesMusicException, getMusicExceptions } = await import("@/lib/musicExceptions");
          const exceptions = await getMusicExceptions(user.id);
          const matched = matchesMusicException(exceptions, parsed.artista || parsed.artist, parsed.titulo || parsed.title);
          
          setMusicData({ 
            titulo: parsed.titulo || parsed.title, 
            artista: parsed.artista || parsed.artist,
            capa: matched?.capa_url || parsed.capa || "",
            artista_url: matched?.artista_url || ""
          });
        }
      } catch {}
    };
    readMusic();
    const mi = setInterval(readMusic, 3000);
    return () => clearInterval(mi);
  }, [user?.id]);

  const firstNext = nextPrograms[0] || null;
  const firstNextAp = firstNext ? nextApresentadores[firstNext.id] : null;

  const targetNext = nextProgram
    ? {
        nome: nextProgram.programa,
        horarioInicio: nextProgram.inicio,
        horarioFim: nextProgram.fim || firstNext?.horarioFim,
        classificacaoEtaria: firstNext?.nome === nextProgram.programa ? firstNext?.classificacaoEtaria : "",
        apresentadorNome: nextProgram.apresentador || firstNextAp?.nome,
      }
    : firstNext
    ? {
        nome: firstNext.nome,
        horarioInicio: firstNext.horarioInicio,
        horarioFim: firstNext.horarioFim,
        classificacaoEtaria: firstNext.classificacaoEtaria,
        apresentadorNome: firstNextAp?.nome,
      }
    : null;

  if (loading) {
    if (compact) {
      return (
        <div className="flex items-center gap-4 animate-pulse">
          <span ref={anchorRef} className="hidden" aria-hidden="true" />
          <div className="space-y-1.5 flex-1 max-w-[200px]">
            <div className="w-14 h-3 rounded bg-white/20" />
            <div className="w-28 h-5 rounded bg-white/20" />
            <div className="w-20 h-3 rounded bg-white/20" />
          </div>
          <div className="w-px h-10 bg-white/10 shrink-0" />
          <div className="space-y-1.5 flex-1 max-w-[200px]">
            <div className="w-14 h-3 rounded bg-white/20" />
            <div className="w-28 h-5 rounded bg-white/20" />
            <div className="w-20 h-3 rounded bg-white/20" />
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col animate-pulse">
        <span ref={anchorRef} className="hidden" aria-hidden="true" />
        {/* NO AR label skeleton */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3.5 h-3.5 rounded-full bg-white/10" />
          <div className="w-12 h-3 rounded bg-white/10" />
        </div>
        {/* Program name skeleton */}
        <div className="flex-1 flex flex-col justify-center gap-2" style={{ maxWidth: "55%" }}>
          <div className="w-full h-5 rounded bg-white/10" />
          <div className="w-3/4 h-5 rounded bg-white/10" />
          <div className="w-24 h-2.5 rounded bg-white/10 mt-1" />
        </div>
        {/* Presenter skeleton */}
        <div className="flex items-center gap-1.5 mb-4">
          <div className="w-3 h-3 rounded-full bg-white/10" />
          <div className="w-28 h-3 rounded bg-white/10" />
        </div>
        {/* Progress bar skeleton */}
        <div className="absolute bottom-0 left-0 right-0">
          <div className="w-full h-1 bg-white/10" />
        </div>
        {/* Fake presenter photo placeholder */}
        <div className="absolute right-0 bottom-0 w-[50%] h-[80%] rounded-tl-2xl bg-white/5" />
      </div>
    );
  }

  if (!onAir) {
    if (compact) {
      return (
        <>
          <div
            className="animate-fade-in flex flex-row items-stretch gap-3 sm:gap-6 min-w-0"
            style={{ color: "var(--layout-nav-text, #ffffff)" }}
          >
            <div className="min-w-0 flex-1 max-w-[280px] sm:max-w-[320px]">
              <div className="flex items-center gap-1.5 mb-1">
                <Radio size={9} className="opacity-60 shrink-0" style={{ color: "var(--layout-accent-color)" }} />
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-80" style={{ color: "var(--layout-accent-color)" }}>
                  Ao vivo
                </span>
              </div>
              <p className="text-base sm:text-lg font-bold leading-tight opacity-70">
                Nenhum programa no ar
              </p>
            </div>
            {targetNext?.nome && (
              <>
                <div
                  className="w-px self-stretch my-0.5 shrink-0 opacity-25"
                  style={{ backgroundColor: "currentColor" }}
                />
                <div
                  className="min-w-0 flex-1 max-w-[280px] sm:max-w-[320px] cursor-pointer group/aseguir"
                  onClick={() => setGradeOpen(true)}
                  title="Clique para ver a grade de programação"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <ArrowRight size={10} className="shrink-0 transition-transform group-hover/aseguir:translate-x-0.5" style={{ color: "var(--layout-accent-color)" }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--layout-accent-color)" }}>
                      A seguir
                    </span>
                  </div>
                  <p className="text-base sm:text-lg font-bold leading-tight truncate group-hover/aseguir:opacity-90" title={targetNext.nome}>
                    {targetNext.nome}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs">
                    <span className="inline-flex items-center gap-1 opacity-75 shrink-0">
                      <Clock size={11} /> {targetNext.horarioInicio}{targetNext.horarioFim ? ` — ${targetNext.horarioFim}` : ""}
                    </span>
                    {targetNext.apresentadorNome && targetNext.apresentadorNome !== "—" && (
                      <span className="inline-flex items-center gap-1 font-semibold truncate max-w-[160px]">
                        <Mic size={11} /> {targetNext.apresentadorNome}
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <Suspense fallback={null}>
            <DashboardGradeDialog open={gradeOpen} onOpenChange={setGradeOpen} />
          </Suspense>
        </>
      );
    }

    return (
      <div className="h-full flex flex-col">
        <span ref={anchorRef} className="hidden" aria-hidden="true" />
        <div className="flex items-center gap-2 mb-2">
          <Radio size={16} className="text-white/70" />
          <span className="font-semibold text-white text-sm" translate="no">NO AR</span>
        </div>
        <p className="text-white/50 text-xs">Nenhum programa no ar neste momento.</p>
        <UpcomingProgramsList programs={nextPrograms} apresentadores={nextApresentadores} />
      </div>
    );
  }

  const { programa, progress } = onAir;

  if (compact) {
    const apresentadorAtual = apresentadoresAtuais[apresentadorIndex];
    const hasNext = Boolean(targetNext?.nome);

    return (
      <>
        <div
          className="animate-fade-in flex flex-row items-stretch gap-3 sm:gap-6 min-w-0"
          style={{ color: "var(--layout-nav-text, #ffffff)" }}
        >
          {/* Programa Ao Vivo */}
          <div className="min-w-0 flex-1 max-w-[280px] sm:max-w-[320px]">
            <div className="flex items-center gap-1.5 mb-1">
              <Radio size={9} className="animate-pulse shrink-0" style={{ color: "var(--layout-accent-color)" }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--layout-accent-color)" }}>
                Ao vivo
              </span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-base sm:text-lg font-bold leading-tight truncate" title={programa.nome}>
                {programa.nome}
              </p>
              {programa.classificacaoEtaria && (
                <span
                  className="shrink-0 rounded px-1 py-0.5 text-[8px] font-bold leading-none text-white"
                  style={{
                    backgroundColor:
                      programa.classificacaoEtaria === "L" ? "#00a651" :
                      programa.classificacaoEtaria === "10" ? "#0095d9" :
                      programa.classificacaoEtaria === "12" ? "#f5a623" :
                      programa.classificacaoEtaria === "14" ? "#e67e22" :
                      programa.classificacaoEtaria === "16" ? "#e74c3c" :
                      programa.classificacaoEtaria === "18" ? "#1a1a1a" : "rgba(0,33,50,0.6)",
                  }}
                >
                  {programa.classificacaoEtaria}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs">
              <span className="inline-flex items-center gap-1 opacity-75 shrink-0">
                <Clock size={11} /> {programa.horarioInicio} — {programa.horarioFim}
              </span>
              {apresentadorAtual?.nome && apresentadorAtual.nome !== "—" && (
                <span className="inline-flex items-center gap-1 font-semibold truncate max-w-[160px]">
                  <Mic size={11} /> {apresentadorAtual.nome}
                </span>
              )}
            </div>

            {/* Barra de progresso do programa ao vivo */}
            <div
              className="mt-2 w-full max-w-[240px] sm:max-w-[280px]"
              title={`Progresso: ${Math.round(liveProgress)}%`}
            >
              <div
                className="w-full h-[3px] rounded-full overflow-hidden"
                style={{ backgroundColor: "rgba(255,255,255,0.22)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-1000 origin-left"
                  style={{
                    width: `${Math.max(1, Math.min(100, liveProgress))}%`,
                    backgroundColor: "var(--layout-accent-color, #ffffff)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Divisor vertical e Programa A Seguir (ao lado) */}
          {hasNext && targetNext && (
            <>
              <div
                className="w-px self-stretch my-0.5 shrink-0 opacity-25"
                style={{ backgroundColor: "currentColor" }}
              />

              <div
                className="min-w-0 flex-1 max-w-[280px] sm:max-w-[320px] cursor-pointer group/aseguir"
                onClick={() => setGradeOpen(true)}
                title="Clique para ver a grade de programação"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <ArrowRight size={10} className="shrink-0 transition-transform group-hover/aseguir:translate-x-0.5" style={{ color: "var(--layout-accent-color)" }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--layout-accent-color)" }}>
                    A seguir
                  </span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-base sm:text-lg font-bold leading-tight truncate group-hover/aseguir:opacity-90" title={targetNext.nome}>
                    {targetNext.nome}
                  </p>
                  {targetNext.classificacaoEtaria && (
                    <span
                      className="shrink-0 rounded px-1 py-0.5 text-[8px] font-bold leading-none text-white"
                      style={{
                        backgroundColor:
                          targetNext.classificacaoEtaria === "L" ? "#00a651" :
                          targetNext.classificacaoEtaria === "10" ? "#0095d9" :
                          targetNext.classificacaoEtaria === "12" ? "#f5a623" :
                          targetNext.classificacaoEtaria === "14" ? "#e67e22" :
                          targetNext.classificacaoEtaria === "16" ? "#e74c3c" :
                          targetNext.classificacaoEtaria === "18" ? "#1a1a1a" : "rgba(0,33,50,0.6)",
                      }}
                    >
                      {targetNext.classificacaoEtaria}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs">
                  <span className="inline-flex items-center gap-1 opacity-75 shrink-0">
                    <Clock size={11} /> {targetNext.horarioInicio}{targetNext.horarioFim ? ` — ${targetNext.horarioFim}` : ""}
                  </span>
                  {targetNext.apresentadorNome && targetNext.apresentadorNome !== "—" && (
                    <span className="inline-flex items-center gap-1 font-semibold truncate max-w-[160px]">
                      <Mic size={11} /> {targetNext.apresentadorNome}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <Suspense fallback={null}>
          <DashboardGradeDialog open={gradeOpen} onOpenChange={setGradeOpen} />
        </Suspense>
      </>
    );
  }

  return (
    <div className="h-full relative overflow-hidden">
      <span ref={anchorRef} className="hidden" aria-hidden="true" />
      {/* Next program click overlay */}
      {firstNext && (
        <div
          className="absolute inset-0 z-20 flex flex-col transition-all duration-500 ease-in-out"
          style={{
            opacity: isHovered ? 1 : 0,
            pointerEvents: isHovered ? "auto" : "none",
          }}
        >
          {firstNextAp?.foto && (
            <img
              src={firstNextAp.foto}
              alt={firstNextAp.nome}
              className="absolute object-contain pointer-events-none"
              style={{ right: 0, bottom: 0, width: "50%", height: "100%", objectPosition: "right bottom" }}
            />
          )}
          {/* Top right buttons */}
          <div className="absolute top-1 right-1 z-30 flex items-center gap-1">
            <button
              onClick={() => setIsHovered(false)}
              className="bg-white/10 rounded-full px-2 py-1 cursor-pointer"
            >
              <ArrowRight size={10} className="text-white/60 rotate-180" />
            </button>
          </div>

          <div className="flex items-center gap-2 mb-1 pt-1 pl-1">
            <ArrowRight size={14} style={{ color: "var(--layout-accent-color)" }} />
            <span className="font-bold text-[10px]" style={{ color: "var(--layout-accent-color)" }}>PRÓXIMO</span>
          </div>

          <div className="flex-1 flex flex-col justify-center z-10 pl-1 relative">
            {firstNext.selo && (
              <div className="absolute -left-2 -top-8 w-16 h-16 pointer-events-none opacity-80">
                <img src={firstNext.selo} alt="" className="w-full h-full object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />
              </div>
            )}
            <p className="font-bold text-white text-lg leading-tight line-clamp-2" style={{ maxWidth: "55%" }}>{firstNext.nome}</p>
            <p className="text-white/50 text-[10px] whitespace-nowrap mt-1">
              {firstNext.horarioInicio} — {firstNext.horarioFim}
            </p>
          </div>

          <div className="z-10 mb-4 pl-1 flex items-center gap-2">
            <p className="font-semibold text-white/80 text-xs">{firstNextAp?.nome}</p>
            <Avatar className="h-5 w-5 border border-white/20">
              {userAvatar ? <AvatarImage src={userAvatar} alt="Você" /> : null}
              <AvatarFallback className="bg-white/10 text-white/60 text-[8px]">
                <User size={10} />
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => { setIsHovered(false); setGradeOpen(true); }}
              className="w-5 h-5 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
              title="Grade de programação"
            >
              <span className="text-white/70 text-[10px] font-bold leading-none">+</span>
            </button>
          </div>

          <div className="absolute bottom-0 left-0 right-0 z-10">
            <div className="w-full h-1 bg-white/20 overflow-hidden" />
          </div>
        </div>
      )}

      {/* Current program */}
      <div
        className="h-full relative flex flex-col transition-all duration-500"
        style={{ opacity: isHovered ? 0 : 1 }}
      >
        {/* Presenter photo or Music Exception artist photo - anchored to bottom, larger. Animates on change. */}
        {musicData?.artista_url ? (
          <img
            src={musicData.artista_url}
            alt={musicData.artista}
            className="absolute object-contain pointer-events-none transition-all duration-1000 opacity-100 scale-100 translate-x-0"
            style={{ 
              right: 0, 
              bottom: 0, 
              width: "60%", 
              height: "100%", 
              objectPosition: "right bottom",
              zIndex: 10
            }}
          />
        ) : (
          apresentadoresAtuais.map((ap, idx) => (
            ap.foto && (
              <img
                key={`foto-${programa.id}-${ap.foto}-${idx}`}
                src={ap.foto}
                alt={ap.nome}
                className={`absolute object-contain pointer-events-none transition-all duration-1000 ${
                  idx === apresentadorIndex ? "opacity-100 scale-100 translate-x-0" : "opacity-0 scale-95 translate-x-4"
                }`}
                style={{ 
                  right: 0, 
                  bottom: 0, 
                  width: "60%", 
                  height: "100%", 
                  objectPosition: "right bottom",
                  zIndex: idx === apresentadorIndex ? 5 : 0
                }}
              />
            )
          ))
        )}

        {/* Top right buttons */}
        <div className="absolute top-1 right-1 z-20 flex items-center gap-1">
          <button
            onClick={() => setGradeOpen(true)}
            className="bg-white/10 rounded-full px-2 py-1 text-white/60 text-[9px] font-semibold hover:bg-white/20 transition-colors cursor-pointer"
          >
            grade
          </button>
          {firstNext && (
            <div className="bg-white/10 rounded-full px-2 py-1 cursor-pointer" onClick={() => setIsHovered(true)}>
              <ArrowRight size={10} className="text-white/60" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mb-1">
          <Radio size={14} style={{ color: "var(--layout-accent-color)" }} className="animate-pulse" />
          <span className="font-bold text-xs animate-pulse" translate="no" style={{ color: "var(--layout-accent-color)" }}>NO AR</span>
        </div>

        <div key={`info-${programa.id}`} className="flex-1 flex flex-col justify-center z-10 animate-fade-in relative" style={{ animationDuration: "500ms" }}>
          {programa.selo && (
            <div className="absolute -left-2 -top-10 w-20 h-20 pointer-events-none opacity-90 animate-fade-in">
              <img src={programa.selo} alt="" className="w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]" />
            </div>
          )}
          <div className="flex items-center gap-1.5" style={{ maxWidth: "55%" }}>
            <p className="font-bold text-white text-lg leading-tight line-clamp-2">{programa.nome}</p>
            {programa.classificacaoEtaria && (
              <span className="shrink-0 rounded px-1 py-0.5 text-[8px] font-bold leading-none text-white"
                style={{
                  backgroundColor:
                    programa.classificacaoEtaria === "L" ? "#00a651" :
                    programa.classificacaoEtaria === "10" ? "#0095d9" :
                    programa.classificacaoEtaria === "12" ? "#f5a623" :
                    programa.classificacaoEtaria === "14" ? "#e67e22" :
                    programa.classificacaoEtaria === "16" ? "#e74c3c" :
                    programa.classificacaoEtaria === "18" ? "#1a1a1a" : "#666",
                }}
              >
                {programa.classificacaoEtaria === "L" ? "L" : `${programa.classificacaoEtaria}`}
              </span>
            )}
            {isStereo && (
              <span className="shrink-0 rounded px-1 py-0.5 text-[7px] font-bold leading-none tracking-wide"
                style={{ color: "var(--layout-accent-color)", border: "1px solid var(--layout-accent-color)", opacity: 0.7 }}
              >
                STEREO
              </span>
            )}
          </div>
          <p className="text-white/50 text-[10px] whitespace-nowrap mt-1">
            {programa.horarioInicio} — {programa.horarioFim}
          </p>
        </div>


        <div key={`ap-${apresentadoresAtuais[apresentadorIndex]?.nome}-${apresentadorIndex}`} className="z-10 mb-4 flex items-center gap-1.5 animate-fade-in" style={{ animationDuration: "1000ms" }}>
          <Mic size={12} style={{ color: "var(--layout-accent-color)" }} />
          <p className="font-semibold text-white/80 text-xs transition-all duration-1000">{apresentadoresAtuais[apresentadorIndex]?.nome || "—"}</p>
          <button
            onClick={() => setGradeOpen(true)}
            className="w-5 h-5 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors cursor-pointer ml-1"
            title="Grade de programação"
          >
            <span className="text-white/70 text-[10px] font-bold leading-none">+</span>
          </button>
        </div>


        <div className="absolute bottom-0 left-0 right-0 z-10">
          <div className="w-full h-1 bg-white/20 overflow-hidden">
            <div
              className="h-full transition-all duration-1000"
              style={{ width: `${progress}%`, backgroundColor: "var(--layout-accent-color)" }}
            />
          </div>
        </div>
      </div>
      <Suspense fallback={null}>
        <DashboardGradeDialog open={gradeOpen} onOpenChange={setGradeOpen} />
      </Suspense>
    </div>
  );
}

function UpcomingProgramsList({ programs, apresentadores }: { programs: Programa[]; apresentadores: Record<string, ApresentadorInfo> }) {
  if (programs.length === 0) return null;

  return (
    <div className="space-y-1 mt-2">
      <p className="text-white/40 text-[9px] font-semibold uppercase tracking-wider flex items-center gap-1">
        <Clock size={10} /> Próximos
      </p>
      {programs.map(p => (
        <div key={p.id} className="flex items-center gap-2 bg-white/5 rounded-lg p-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-[10px] truncate">{p.nome}</p>
            <p className="text-white/40 text-[8px] truncate">{apresentadores[p.id]?.nome || "—"}</p>
          </div>
          <p className="text-white/40 text-[8px] whitespace-nowrap font-mono">
            {p.horarioInicio} — {p.horarioFim}
          </p>
        </div>
      ))}
    </div>
  );
}
