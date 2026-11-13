import { useState, useEffect, useRef, useCallback } from "react";
import { Clock, User, Radio, ArrowRight } from "lucide-react";
import { useAlbumColors } from "@/hooks/useAlbumColors";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getProgramas, getProgramasSync, findCurrentProgram } from "@/components/OnAirWidget";
import { getApresentadores } from "@/components/ApresentadorForm";
import { resolveEffectiveOnAir } from "@/lib/onAirResolver";
import { getStationDatabaseSync } from "@/lib/stationDatabaseService";
import { resolvePresenterForProgram, resolveSafePresenterPhoto } from "@/lib/onAirPresenterResolver";
import { normalizeClientKey } from "@/lib/houseMixProgramasService";

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
    const progNome = active?.nome || "Programação Normal";
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

  const [showNextProg, setShowNextProg] = useState(false);
  const [nextProgInfo, setNextProgInfo] = useState<OnAirDisplayState | null>(() => {
    const syncDb = getStationDatabaseSync(targetUid || user?.email);
    const syncPrograms = getProgramasSync(targetUid, user?.email);
    if (syncPrograms && syncPrograms.length > 0) {
      const mapped = syncPrograms.map((p) => ({
        ...p,
        dias_semana: p.diasSemana,
        horario_inicio: p.horarioInicio,
        horario_fim: p.horarioFim,
      }));
      const { next } = resolveEffectiveOnAir(mapped, new Date());
      if (next) {
        const nextAp = resolvePresenterForProgram(next, syncDb?.apresentadores || [], targetUid || user?.email);
        return {
          programaNome: next.nome || "A Seguir",
          horarioInicio: next.horario_inicio || next.horarioInicio || "00:00",
          horarioFim: next.horario_fim || next.horarioFim || "23:59",
          locutorNome: nextAp?.nome || "—",
          locutorFoto: nextAp ? resolveSafePresenterPhoto(nextAp.foto, nextAp.nome, targetUid || user?.email) : "",
        };
      }
    }
    return null;
  });

  const [timezone, setTimezone] = useState<string | null>(null);
  const [animPhase, setAnimPhase] = useState<AnimPhase>("idle");
  const lastKeyRef = useRef<string>("");
  const animTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [presenterIndex, setPresenterIndex] = useState(0);
  const [photoExiting, setPhotoExiting] = useState(false);

  // Load timezone
  useEffect(() => {
    if (!targetUid) return;
    supabase
      .from("empresa_config")
      .select("timezone")
      .eq("user_id", targetUid)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.timezone) setTimezone(data.timezone);
      });
  }, [targetUid]);

  // 2. Resolve program & locutor asynchronously and keep refreshed
  const resolveOnAir = useCallback(async () => {
    try {
      const uid = targetUid || user?.id;
      const [programasData, apresentadoresData] = await Promise.all([
        getProgramas(uid, targetEmail),
        getApresentadores(uid, targetEmail),
      ]);

      // Use resolveEffectiveOnAir with timezone, fallback to findCurrentProgram
      let activeProg: any = null;
      let nextProg: any = null;
      if (programasData.length > 0) {
        const mapped = programasData.map((p) => ({
          ...p,
          dias_semana: p.diasSemana,
          horario_inicio: p.horarioInicio,
          horario_fim: p.horarioFim,
        }));
        const resolved = resolveEffectiveOnAir(mapped, new Date(), timezone);
        activeProg = resolved.current;
        nextProg = resolved.next;
        if (!activeProg) {
          const fallback = findCurrentProgram(programasData);
          if (fallback) {
            activeProg = {
              ...fallback.programa,
              horario_inicio: fallback.programa.horarioInicio,
              horario_fim: fallback.programa.horarioFim,
            };
          }
        }
      }

      if (nextProg) {
        const nextAp = resolvePresenterForProgram(nextProg, apresentadoresData, uid || targetEmail);

        setNextProgInfo({
          programaNome: nextProg.nome || "A Seguir",
          horarioInicio: nextProg.horario_inicio || nextProg.horarioInicio || "00:00",
          horarioFim: nextProg.horario_fim || nextProg.horarioFim || "23:59",
          locutorNome: nextAp?.nome || "—",
          locutorFoto: nextAp ? resolveSafePresenterPhoto(nextAp.foto, nextAp.nome, uid || targetEmail) : "",
        });
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
    } catch (error) {
      console.error("Erro ao atualizar o programa no ar:", error);
    }
  }, [targetUid, user, targetEmail, timezone]);

  useEffect(() => {
    resolveOnAir();
    const iv = setInterval(resolveOnAir, 15000); // refresh every 15s
    window.addEventListener("apresentadores-updated", resolveOnAir);
    return () => {
      clearInterval(iv);
      window.removeEventListener("apresentadores-updated", resolveOnAir);
    };
  }, [resolveOnAir]);

  // Realtime subscription for instant updates on schedules or presenter changes
  useEffect(() => {
    if (!targetUid) return;
    const channel = supabase
      .channel(`floating-onair-${targetUid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "programas" }, () => resolveOnAir())
      .on("postgres_changes", { event: "*", schema: "public", table: "apresentadores" }, () => resolveOnAir())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetUid, resolveOnAir]);

  // Clean up animation timers on unmount
  useEffect(() => {
    return () => {
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const presenterKey = JSON.stringify([onAirInfo.programaKey, onAirInfo.locutores?.map(p => p.id)]);
  useEffect(() => {
    setPresenterIndex(0);
    setPhotoExiting(false);
  }, [presenterKey]);

  const presenterCount = onAirInfo.locutores?.length || 0;
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

  const currentPresenter = onAirInfo.locutores?.[presenterIndex] || onAirInfo.locutores?.[0];
  const currentName = currentPresenter?.nome || onAirInfo.locutorNome;
  const currentPhoto = currentPresenter ? currentPresenter.foto : onAirInfo.locutorFoto;
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

  const formattedStart = formatHour(onAirInfo.horarioInicio);
  const formattedEnd = formatHour(onAirInfo.horarioFim);
  const hoursStr = formattedStart && formattedEnd ? `${formattedStart} às ${formattedEnd}` : "24 Horas";

  // Dynamic colors and hours for Next Program ('A SEGUIR')
  const nextColors = useAlbumColors(nextProgInfo?.locutorFoto || null);
  const nextPrimaryColor = nextColors[0] || "#38bdf8";
  const nextSecondaryColor = nextColors[1] || "#6366f1";
  const formattedNextStart = formatHour(nextProgInfo?.horarioInicio || "");
  const formattedNextEnd = formatHour(nextProgInfo?.horarioFim || "");
  const nextHoursStr =
    formattedNextStart && formattedNextEnd ? `${formattedNextStart} às ${formattedNextEnd}` : "Em Breve";

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
          } hidden sm:flex items-center gap-3.5 relative group`}
          style={{
            userSelect: "none",
            height: 100,
            boxSizing: "border-box",
            backdropFilter: "blur(24px) saturate(1.5)",
            WebkitBackdropFilter: "blur(24px) saturate(1.5)",
            borderRadius: 20,
            padding: "0 54px 0 0",
            overflow: "hidden",
            border: `1px solid ${primaryColor}40`,
            boxShadow: `0 16px 40px rgba(0,0,0,0.55), 0 0 24px ${primaryColor}20, inset 0 1px 0 rgba(255,255,255,0.12)`,
            minWidth: 320,
            maxWidth: "min(460px, calc(100vw - 80px))",
            transition: "box-shadow 1.2s ease-in-out, border-color 1.2s ease-in-out, transform 0.25s ease",
            marginRight: 10,
          }}
        >
          <CardGradient primary={primaryColor} secondary={secondaryColor} />
          <div
            style={{
              width: 100,
              height: "100%",
              overflow: "hidden",
              position: "relative",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              key={`${presenterKey}:${presenterIndex}`}
              style={{
                width: "100%",
                height: "100%",
                transform: photoExiting ? "translateX(-100%)" : "translateX(0)",
                opacity: photoExiting ? 0 : 1,
                transition: `transform ${PHOTO_TRANSITION_MS}ms ease-in-out, opacity ${PHOTO_TRANSITION_MS}ms ease-in-out`,
                animation: presenterCount > 1 ? `fmp-photo-enter ${PHOTO_TRANSITION_MS}ms ease-in-out` : undefined,
              }}
            >
            {currentPhoto ? (
              <img
                key={currentPhoto}
                src={currentPhoto}
                alt={currentName || "Locutor no ar"}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "top center",
                  ...photoAnimStyle,
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  ...photoAnimStyle,
                }}
              >
                <Radio size={32} style={{ color: "rgba(255,255,255,0.75)" }} />
              </div>
            )}
            </div>
          </div>

          {/* Info beside photo: 'NO AR' -> Nome do Programa -> Horário inicial e final -> Locutor */}
          <div style={{ position: "relative", minWidth: 0, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
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
              title={onAirInfo.programaNome}
            >
              {onAirInfo.programaNome}
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
        {/* 2. Arrow inside the NO AR box to reveal / hide the next program */}
        <button
          type="button"
          data-testid="toggle-next-program-button"
          onClick={() => setShowNextProg((prev) => !prev)}
          className={
            (isBehindPages ? "pointer-events-none" : "pointer-events-auto") +
            " hidden sm:flex items-center justify-center absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-all duration-300 hover:scale-110 active:scale-95"
          }
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            background: showNextProg ? "rgba(239, 68, 68, 0.12)" : "rgba(255,255,255,0.07)",
            border: showNextProg ? "1px solid rgba(239, 68, 68, 0.35)" : "1px solid rgba(255,255,255,0.12)",
            outline: "none",
            flexShrink: 0,
            zIndex: 2,
          }}
          title={showNextProg ? "Ocultar próximo programa" : "Ver programa a seguir"}
        >
          <ArrowRight
            size={19}
            style={{
              color: showNextProg ? "#fca5a5" : "rgba(255, 255, 255, 0.9)",
              transform: showNextProg ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), color 0.2s ease",
            }}
          />
        </button>

        </div>

        {/* 3. Next Program Box ('A SEGUIR') with fluid entrance / exit animation on the right side */}
        <div
          data-testid="next-program-animated-box"
          style={{
            maxWidth: showNextProg ? 420 : 0,
            opacity: showNextProg ? 1 : 0,
            transform: showNextProg ? "translateX(0) scale(1)" : "translateX(-24px) scale(0.96)",
            transition:
              "max-width 0.42s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.32s cubic-bezier(0.16, 1, 0.3, 1), transform 0.42s cubic-bezier(0.16, 1, 0.3, 1)",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            pointerEvents: showNextProg && !isBehindPages ? "auto" : "none",
          }}
        >
          <div
            className="flex items-center gap-3.5 relative"
            style={{
              userSelect: "none",
              height: 100,
              boxSizing: "border-box",
              backdropFilter: "blur(24px) saturate(1.5)",
              WebkitBackdropFilter: "blur(24px) saturate(1.5)",
              borderRadius: 20,
              padding: "0 18px 0 0",
              overflow: "hidden",
              border: `1px solid ${nextPrimaryColor}40`,
              boxShadow: `0 16px 40px rgba(0,0,0,0.55), 0 0 24px ${nextPrimaryColor}20, inset 0 1px 0 rgba(255,255,255,0.12)`,
              minWidth: 240,
              maxWidth: "min(400px, calc(100vw - 120px))",
              whiteSpace: "nowrap",
            }}
          >
            <CardGradient primary={nextPrimaryColor} secondary={nextSecondaryColor} />
            <div
              style={{
                width: 100,
                height: "100%",
                overflow: "hidden",
                position: "relative",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {nextProgInfo?.locutorFoto ? (
                <img
                  src={nextProgInfo.locutorFoto}
                  alt={nextProgInfo?.locutorNome || "Próximo locutor"}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "top center",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Radio size={32} style={{ color: "rgba(255,255,255,0.75)" }} />
                </div>
              )}
            </div>

            {/* Info beside photo: 'A SEGUIR' -> Nome do Programa -> Horário -> Nome do Locutor */}
            <div style={{ position: "relative", minWidth: 0, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              {/* 1. 'A SEGUIR' badge with site layout blue (#0055ff) */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <ArrowRight
                  size={12}
                  style={{
                    color: "#ffffff",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#ffffff",
                    lineHeight: 1,
                  }}
                >
                  A SEGUIR
                </span>
              </div>

              {/* 2. Embaixo de 'A SEGUIR': O nome do programa */}
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
                }}
                title={nextProgInfo?.programaNome || "A Seguir"}
              >
                {nextProgInfo?.programaNome || "A Seguir"}
              </p>

              {/* 3. Embaixo do nome: Horário */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  marginTop: 2,
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
                  {nextHoursStr}
                </span>
              </div>

              {/* 4. Embaixo do horário: O nome do locutor */}
              {nextProgInfo?.locutorNome && nextProgInfo.locutorNome !== "—" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    marginTop: 2,
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
                    title={nextProgInfo.locutorNome}
                  >
                    {nextProgInfo.locutorNome}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fmp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.8); }
        }
        @keyframes fmp-photo-enter {
          from { transform: translateX(-100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
