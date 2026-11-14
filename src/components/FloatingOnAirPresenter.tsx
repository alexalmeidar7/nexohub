import { useState, useEffect, useRef, useCallback } from "react";
import { Clock, User, Radio, ArrowRight } from "lucide-react";
import { useAlbumColors } from "@/hooks/useAlbumColors";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getProgramas, getProgramasSync, findCurrentProgram } from "@/components/OnAirWidget";
import { getApresentadores } from "@/components/ApresentadorForm";
import { getZonedNow, resolveEffectiveOnAir } from "@/lib/onAirResolver";
import { getStationDatabaseSync } from "@/lib/stationDatabaseService";
import { resolvePresenterForProgram, resolveSafePresenterPhoto } from "@/lib/onAirPresenterResolver";

export { resolveSafePresenterPhoto };

export interface FloatingOnAirPresenterProps {
  isBehindPages?: boolean;
  effectiveUserId?: string | null;
}

interface OnAirDisplayState {
  programaKey?: string;
  programaNome: string;
  horarioInicio: string;
  horarioFim: string;
  locutorNome: string;
  locutorFoto: string;
  locutores?: { id: string; nome: string; foto: string }[];
}

type AnimPhase = "idle" | "exiting" | "entering-prep";

const PHOTO_TRANSITION_MS = 700;
const PRESENTER_INTERVAL_MS = 4000;
const REFRESH_INTERVAL_MS = 15000;
const MAX_REFRESH_BACKOFF_MS = 120000;

function CardGradient({ primary, secondary }: { primary: string; secondary: string }) {
  const layer: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    transition: "background-color 1.2s ease-in-out",
  };
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "rgba(5, 9, 18, 0.95)", pointerEvents: "none" }}>
      <div style={{ ...layer, backgroundColor: secondary, opacity: 0.33, maskImage: "linear-gradient(135deg, transparent, black 45%, transparent)" }} />
      <div style={{ ...layer, backgroundColor: primary, opacity: 0.53, maskImage: "linear-gradient(135deg, black, transparent 75%)" }} />
    </div>
  );
}

type ProgramPresenters = {
  apresentador_id?: string | null;
  apresentadorId?: string | null;
  apresentadores_ids?: string[] | null;
  apresentadoresIds?: string[] | null;
};

function getProgramPresenters(program: ProgramPresenters | null | undefined, presenters: { id: string; nome: string; foto: string; stationKey?: string }[], station?: string | null) {
  const ids = program?.apresentadores_ids?.length ? program.apresentadores_ids : program?.apresentadoresIds;
  const uniqueIds = Array.from(new Set(ids?.filter(Boolean) || []));
  if (uniqueIds.length === 0) {
    const presenter = resolvePresenterForProgram(program, presenters, station);
    return presenter ? [{ id: presenter.id, nome: presenter.nome, foto: resolveSafePresenterPhoto(presenter.foto, presenter.nome, station) }] : [];
  }
  return uniqueIds.flatMap(id => {
    const presenter = resolvePresenterForProgram({ ...program, apresentador_id: id, apresentadorId: id }, presenters, station);
    return presenter ? [{ id: presenter.id, nome: presenter.nome, foto: resolveSafePresenterPhoto(presenter.foto, presenter.nome, station) }] : [];
  });
}

function formatHour(h: string): string {
  if (!h) return "00:00";
  const parts = h.split(":");
  return `${parts[0] || "00"}:${parts[1] || "00"}`;
}

export default function FloatingOnAirPresenter({
  isBehindPages = false,
  effectiveUserId,
}: FloatingOnAirPresenterProps) {
  const { user } = useAuth();
  const targetUid = effectiveUserId || user?.id;
  const targetEmail = user?.email;

  // 1. Synchronous initial state from station database cache (instant render)
  const [onAirInfo, setOnAirInfo] = useState<OnAirDisplayState>(() => {
    const syncDb = getStationDatabaseSync(targetUid || user?.email);
    const syncPrograms = getProgramasSync(targetUid, user?.email);
    const current = findCurrentProgram(syncPrograms);

    const active = current?.programa || syncDb?.currentProgram;
    const progNome = active?.nome || "Programa" + String.fromCharCode(231) + String.fromCharCode(227) + "o Normal";
    const hInicio = active?.horarioInicio || active?.horario_inicio || "00:00";
    const hFim = active?.horarioFim || active?.horario_fim || "23:59";

    const locutores = getProgramPresenters(active, syncDb?.apresentadores || [], targetUid || user?.email);

    return {
      programaKey: active?.id || progNome,
      programaNome: progNome,
      horarioInicio: hInicio,
      horarioFim: hFim,
      locutorNome: locutores[0]?.nome || "—",
      locutorFoto: locutores[0]?.foto || "",
      locutores,
    };
  });

  const [scheduleItems, setScheduleItems] = useState<OnAirDisplayState[]>([]);
  const [scheduleIndex, setScheduleIndex] = useState<number | null>(null);
  const [slideDirection, setSlideDirection] = useState<"forward" | "backward">("forward");
  const [photoSlide, setPhotoSlide] = useState<{ key: number; from: string; to: string; direction: "forward" | "backward" } | null>(null);
  const photoSlideTimerRef = useRef<number | null>(null);

  const [timezone, setTimezone] = useState<string | null>(null);
  const [animPhase, setAnimPhase] = useState<AnimPhase>("idle");
  const lastKeyRef = useRef<string>("");
  const animTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [presenterIndex, setPresenterIndex] = useState(0);
  const [photoExiting, setPhotoExiting] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const refreshInFlightRef = useRef(false);
  const mountedRef = useRef(false);

  // Load timezone
  useEffect(() => {
    if (!targetUid) return;
    let cancelled = false;
    setTimezone(null);
    void supabase
      .from("empresa_config")
      .select("timezone")
      .eq("user_id", targetUid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("Erro ao carregar o fuso da estação:", error);
          return;
        }
        if (!cancelled) setTimezone(data?.timezone || null);
      })
    return () => { cancelled = true; };
  }, [targetUid]);

  // 2. Resolve program & locutor asynchronously and keep refreshed
  const resolveOnAir = useCallback(async () => {
    if (refreshInFlightRef.current) return false;
    refreshInFlightRef.current = true;
    try {
      const uid = targetUid || user?.id;
      const [programasData, apresentadoresData] = await Promise.all([
        getProgramas(uid, targetEmail),
        getApresentadores(uid, targetEmail),
      ]);
      if (!mountedRef.current) return false;

      const todayName = ["Domingo", "Segunda", "Ter" + String.fromCharCode(231) + "a", "Quarta", "Quinta", "Sexta", "S" + String.fromCharCode(225) + "bado"][getZonedNow(timezone).weekday];
      const browseSchedule: OnAirDisplayState[] = programasData
        .filter((p) => Array.isArray(p.diasSemana) && p.diasSemana.includes(todayName))
        .sort((a, b) => (a.horarioInicio || "00:00").localeCompare(b.horarioInicio || "00:00"))
        .map((p) => {
          const locutores = getProgramPresenters(p, apresentadoresData, uid || targetEmail);
          return {
            programaKey: p.id || p.nome,
            programaNome: p.nome || "Programação Normal",
            horarioInicio: p.horarioInicio || "00:00",
            horarioFim: p.horarioFim || "23:59",
            locutorNome: locutores[0]?.nome || "—",
            locutorFoto: locutores[0]?.foto || "",
            locutores,
          };
        });
      setScheduleItems(browseSchedule);

      // Resolve using the station timezone; avoid a local-time fallback.
      let activeProg: any = null;
      if (programasData.length > 0) {
        const mapped = programasData.map((p) => ({
          ...p,
          dias_semana: p.diasSemana,
          horario_inicio: p.horarioInicio,
          horario_fim: p.horarioFim,
        }));
        const resolved = resolveEffectiveOnAir(mapped, new Date(), timezone);
        activeProg = resolved.current;
      }

      if (activeProg) {
        const locutores = getProgramPresenters(activeProg, apresentadoresData, uid || targetEmail);

        const nextState: OnAirDisplayState = {
          programaKey: activeProg.id || activeProg.nome,
          programaNome: activeProg.nome || "Programação Normal",
          horarioInicio: activeProg.horario_inicio || activeProg.horarioInicio || "00:00",
          horarioFim: activeProg.horario_fim || activeProg.horarioFim || "23:59",
          locutorNome: locutores[0]?.nome || "—",
          locutorFoto: locutores[0]?.foto || "",
          locutores,
        };

        const key = `${nextState.programaKey}:::${nextState.horarioInicio}`;
        if (!lastKeyRef.current) {
          lastKeyRef.current = key;
          setOnAirInfo(nextState);
        } else if (lastKeyRef.current !== key) {
          lastKeyRef.current = key;
          setScheduleIndex(null);
          if (animTimerRef.current) clearTimeout(animTimerRef.current);
          if (rafRef.current) cancelAnimationFrame(rafRef.current);

          // Exit transition
          setAnimPhase("exiting");
          animTimerRef.current = window.setTimeout(() => {
            setOnAirInfo(nextState);
            setAnimPhase("entering-prep");
            rafRef.current = requestAnimationFrame(() => {
              rafRef.current = requestAnimationFrame(() => {
                setAnimPhase("idle");
              });
            });
          }, 220);
        } else {
          setOnAirInfo((prev) => JSON.stringify(prev) === JSON.stringify(nextState) ? prev : nextState);
        }
      } else {
        setOnAirInfo((prev) => ({
          ...prev,
          programaNome: "Programação Normal",
          locutorNome: "—",
          locutorFoto: "",
          locutores: [],
          programaKey: "",
        }));
      }
      return true;
    } catch (error) {
      console.error("Erro ao atualizar o programa no ar:", error);
      return false;
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [targetUid, user, targetEmail, timezone]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let backoffMs = REFRESH_INTERVAL_MS;
    const refreshAndSchedule = async () => {
      const succeeded = await resolveOnAir();
      if (cancelled) return;
      backoffMs = succeeded ? REFRESH_INTERVAL_MS : Math.min(backoffMs * 2, MAX_REFRESH_BACKOFF_MS);
      timer = window.setTimeout(refreshAndSchedule, backoffMs);
    };
    const refreshImmediately = () => {
      if (refreshInFlightRef.current) return;
      if (timer !== undefined) window.clearTimeout(timer);
      void refreshAndSchedule();
    };
    void refreshAndSchedule();
    window.addEventListener("apresentadores-updated", refreshImmediately);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("apresentadores-updated", refreshImmediately);
    };
  }, [resolveOnAir]);

  // Realtime subscription for instant updates on schedules or presenter changes
  useEffect(() => {
    if (!targetUid) return;
    const channel = supabase
      .channel(`floating-onair-${targetUid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "programas", filter: `user_id=eq.${targetUid}` }, () => { void resolveOnAir(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "apresentadores", filter: `user_id=eq.${targetUid}` }, () => { void resolveOnAir(); })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetUid, resolveOnAir]);

  // Clean up animation timers on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (photoSlideTimerRef.current) clearTimeout(photoSlideTimerRef.current);
    };
  }, []);

  const safeScheduleIndex = scheduleIndex !== null && scheduleIndex < scheduleItems.length ? scheduleIndex : null;
  const isBrowsingSchedule = safeScheduleIndex !== null && scheduleItems.length > 0;
  const displayedInfo = isBrowsingSchedule ? scheduleItems[safeScheduleIndex] : onAirInfo;
  useEffect(() => {
    if (scheduleIndex !== null && scheduleIndex >= scheduleItems.length) setScheduleIndex(null);
  }, [scheduleIndex, scheduleItems.length]);

  const presenterKey = JSON.stringify([displayedInfo.programaKey, displayedInfo.locutores?.map(p => p.id)]);
  useEffect(() => {
    setPresenterIndex(0);
    setPhotoExiting(false);
  }, [presenterKey]);

  const presenterCount = displayedInfo.locutores?.length || 0;
  useEffect(() => {
    if (presenterCount < 2) return;
    const exitTimer = window.setTimeout(() => setPhotoExiting(true), PRESENTER_INTERVAL_MS - PHOTO_TRANSITION_MS);
    const nextTimer = window.setTimeout(() => {
      setPresenterIndex(index => (index + 1) % presenterCount);
      setPhotoExiting(false);
    }, PRESENTER_INTERVAL_MS);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(nextTimer);
    };
  }, [presenterKey, presenterCount, presenterIndex]);

  const currentPresenter = displayedInfo.locutores?.[presenterIndex] || displayedInfo.locutores?.[0];
  const currentName = currentPresenter?.nome || displayedInfo.locutorNome;
  const currentPhoto = currentPresenter ? currentPresenter.foto : displayedInfo.locutorFoto;
  useEffect(() => setPhotoFailed(false), [currentPhoto]);
  // 3. Dynamic colors extracted from the locutor's photo
  const locutorColors = useAlbumColors(currentPhoto || null);
  const primaryColor = locutorColors[0] || "#0055ff";
  const secondaryColor = locutorColors[1] || "#7c3aed";

  // Animation styles based on phase:
  const photoAnimStyle: React.CSSProperties =
    animPhase === "exiting"
      ? {
          opacity: 0,
          transform: "scale(0.9) rotate(-1.5deg)",
          filter: "blur(3px)",
          transition: "transform 0.22s cubic-bezier(0.4, 0, 1, 1), opacity 0.2s ease, filter 0.2s ease",
        }
      : animPhase === "entering-prep"
      ? {
          opacity: 0,
          transform: "scale(1.08) rotate(1.5deg)",
          filter: "blur(3px)",
          transition: "none",
        }
      : {
          opacity: 1,
          transform: "scale(1) rotate(0deg)",
          filter: "blur(0px)",
          transition: "transform 0.42s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease, filter 0.35s ease",
        };

  const textAnimStyle: React.CSSProperties =
    animPhase === "exiting"
      ? {
          opacity: 0,
          transform: "translateY(-8px)",
          transition: "transform 0.22s cubic-bezier(0.4, 0, 1, 1), opacity 0.2s ease",
        }
      : animPhase === "entering-prep"
      ? {
          opacity: 0,
          transform: "translateY(10px)",
          transition: "none",
        }
      : {
          opacity: 1,
          transform: "translateY(0)",
          transition: "transform 0.38s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.32s ease",
        };

  const formattedStart = formatHour(displayedInfo.horarioInicio);
  const formattedEnd = formatHour(displayedInfo.horarioFim);
  const hoursStr = formattedStart && formattedEnd ? `${formattedStart} às ${formattedEnd}` : "24 Horas";

  const navigateSchedule = useCallback((direction: "forward" | "backward") => {
    if (scheduleItems.length < 2) return;
    const currentIndex = scheduleIndex ?? scheduleItems.findIndex((item) => item.programaKey === onAirInfo.programaKey);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = direction === "forward"
      ? (baseIndex + 1) % scheduleItems.length
      : (baseIndex - 1 + scheduleItems.length) % scheduleItems.length;
    const nextInfo = scheduleItems[nextIndex];
    const nextPhoto = nextInfo?.locutores?.[0]?.foto || nextInfo?.locutorFoto || "";
    const currentPhotoForSlide = currentPhoto || displayedInfo.locutorFoto || "";
    setSlideDirection(direction);
    if (photoSlideTimerRef.current) clearTimeout(photoSlideTimerRef.current);
    setPhotoSlide({ key: Date.now(), from: currentPhotoForSlide, to: nextPhoto, direction });
    setScheduleIndex(nextIndex);
    photoSlideTimerRef.current = window.setTimeout(() => setPhotoSlide(null), PHOTO_TRANSITION_MS + 40);
  }, [scheduleItems, scheduleIndex, onAirInfo.programaKey, currentPhoto, displayedInfo.locutorFoto]);

  return (
    <div
      data-floating-onair-presenter
      className={`fixed bottom-6 left-0 right-0 select-none ${
        isBehindPages
          ? "z-[2] pointer-events-none opacity-0 invisible"
          : "z-30 pointer-events-none opacity-100 visible"
      }`}
      style={{
        transition: "z-index 0.2s ease, opacity 0.25s ease, visibility 0.25s ease",
      }}
    >
      <div className="max-w-[1600px] mx-auto px-4 lg:px-8 w-full flex items-center justify-end pointer-events-none">
        {/* 1. Current Program Box ('NO AR') */}
        <div
          data-testid="onair-current-program-box"
          className={`${
            isBehindPages ? "pointer-events-none" : "pointer-events-auto"
          } hidden sm:flex items-center justify-center gap-3.5 relative group`}
          style={{
            userSelect: "none",
            height: 100,
            boxSizing: "border-box",
            backdropFilter: "blur(24px) saturate(1.5)",
            WebkitBackdropFilter: "blur(24px) saturate(1.5)",
            borderRadius: 20,
            padding: "0 34px",
            overflow: "hidden",
            border: `1px solid ${primaryColor}40`,
            boxShadow: `0 16px 40px rgba(0,0,0,0.55), 0 0 24px ${primaryColor}20, inset 0 1px 0 rgba(255,255,255,0.12)`,
            minWidth: 0,
            width: "360px",
            maxWidth: "calc(100vw - 48px)",
            transition: "box-shadow 1.2s ease-in-out, border-color 1.2s ease-in-out",
            marginRight: 10,
          }}
        >
          <CardGradient primary={primaryColor} secondary={secondaryColor} />
          <div
            style={{
              width: 72,
              height: 72,
              overflow: "visible",
              position: "relative",
              flexShrink: 0,
              zIndex: 2,
            }}
          >
            {!photoSlide && (
              <div key={`${presenterKey}:${presenterIndex}`} style={{ width: "100%", height: "100%", position: "relative", zIndex: 2 }}>
                {currentPhoto && !photoFailed ? (
                  <img key={currentPhoto} src={currentPhoto} alt={currentName || "Locutor no ar"} onError={() => setPhotoFailed(true)} style={{
                    width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", ...photoAnimStyle,
                  }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", ...photoAnimStyle }}>
                    <Radio size={32} style={{ color: "rgba(255,255,255,0.75)" }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {photoSlide && (
            <div key={photoSlide.key} style={{ position: "absolute", inset: 0, zIndex: 1, overflow: "hidden", pointerEvents: "none" }}>
              {photoSlide.from && (
                <img src={photoSlide.from} alt="" aria-hidden="true" style={{
                  position: "absolute", top: "calc(50% - 36px)", left: "calc(50% - 138px)", width: 72, height: 72, objectFit: "cover", objectPosition: "top center",
                  animation: `fmp-photo-exit-${photoSlide.direction} ${PHOTO_TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`,
                }} />
              )}
              {photoSlide.to && (
                <img key={`${photoSlide.key}-incoming`} src={photoSlide.to} alt="" aria-hidden="true" style={{
                  position: "absolute", top: "calc(50% - 36px)", left: "calc(50% - 138px)", width: 72, height: 72, objectFit: "cover", objectPosition: "top center",
                  animation: `fmp-photo-enter-${photoSlide.direction} ${PHOTO_TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`,
                }} />
              )}
            </div>
          )}

          {/* Info beside photo: 'NO AR' -> Nome do Programa -> Horário inicial e final -> Locutor */}
          <div
            key={`schedule-${displayedInfo.programaKey}-${scheduleIndex ?? "live"}-${slideDirection}`}
            style={{
              position: "relative",
              zIndex: 3,
              minWidth: 0,
              flex: "0 1 190px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              animation: isBrowsingSchedule ? `fmp-slide-${slideDirection} 420ms cubic-bezier(0.16, 1, 0.3, 1)` : undefined,
            }}
          >
            {!isBrowsingSchedule && (
              <>
                {/* 1. 'no ar' badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  backgroundColor: "#ef4444",
                  boxShadow: "0 0 10px rgba(239, 68, 68, 0.9)",
                  animation: "fmp-pulse 1.8s ease-in-out infinite",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#ef4444",
                  lineHeight: 1,
                }}
              >
                NO AR
              </span>
                </div>
              </>
            )}

            {/* 2. Embaixo de 'no ar': O nome do programa */}
            <p
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: "#ffffff",
                lineHeight: 1.15,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                margin: 0,
                letterSpacing: "-0.01em",
                textTransform: "uppercase",
                textShadow: "0 2px 8px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.9)",
                ...textAnimStyle,
              }}
              title={displayedInfo.programaNome}
            >
              {displayedInfo.programaNome}
            </p>

            {/* 3. Embaixo do nome do programa: Horário inicial e final do programa */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                marginTop: 2,
                ...textAnimStyle,
              }}
            >
              <Clock size={11} style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.65)",
                  lineHeight: 1.2,
                  letterSpacing: "0.02em",
                  textTransform: "uppercase",
                  textShadow: "0 2px 6px rgba(0,0,0,0.85)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {hoursStr}
              </span>
            </div>

            {/* 4. Embaixo do horário: O nome do locutor */}
            {currentName && currentName !== "—" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 2,
                  ...textAnimStyle,
                }}
              >
                <User size={10} style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 400,
                    color: "rgba(255,255,255,0.85)",
                    lineHeight: 1.2,
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                    textShadow: "0 2px 6px rgba(0,0,0,0.85)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={currentName}
                >
                  {currentName}
                </span>
              </div>
            )}
          </div>

          {/* Setas dentro do próprio box */}
          <div style={{ position: "absolute", inset: 0, zIndex: 6, pointerEvents: "none" }}>
            <button type="button" data-testid="previous-program-button" aria-label="Programa anterior"
              onClick={() => navigateSchedule("backward")}
              style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 24, height: 40, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", outline: "none", cursor: "pointer", color: "rgba(255,255,255,0.9)", pointerEvents: "auto", zIndex: 7 }}
              title="Programa anterior">
              <ArrowRight size={17} style={{ transform: "rotate(180deg)" }} />
            </button>
            <button type="button" data-testid="next-program-button" aria-label="Próximo programa"
              onClick={() => navigateSchedule("forward")}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 24, height: 40, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", outline: "none", cursor: "pointer", color: "rgba(255,255,255,0.9)", pointerEvents: "auto" }}
              title="Próximo programa">
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fmp-slide-forward {
          from { transform: translateX(42px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fmp-slide-backward {
          from { transform: translateX(-42px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fmp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.8); }
        }
        @keyframes fmp-photo-enter-forward {
          from { left: calc(100% - 82px); opacity: 1; }
          to { left: 0; opacity: 1; }
        }
        @keyframes fmp-photo-enter-backward {
          from { left: -82px; opacity: 1; }
          to { left: 0; opacity: 1; }
        }
        @keyframes fmp-photo-exit-forward {
          from { left: 0; opacity: 1; }
          to { left: -82px; opacity: 1; }
        }
        @keyframes fmp-photo-exit-backward {
          from { left: 0; opacity: 1; }
          to { left: calc(100% - 82px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
