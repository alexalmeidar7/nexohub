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
    <div
      data-floating-onair-presenter
      className={`fixed bottom-6 left-0 right-0 select-none ${
        isBehindPages
          ? "z-[2] pointer-events-none opacity-0 invisible"
          : "z-30 pointer-events-none opacity-100 visible"
      }`}
      style={{ transition: "z-index 0.2s ease, opacity 0.25s ease, visibility 0.25s ease" }}
    >
      <div className="max-w-[1600px] mx-auto px-4 lg:px-8 w-full flex items-center justify-end pointer-events-none">
        <div
          data-testid="onair-current-program-box"
          className={`${isBehindPages ? "pointer-events-none" : "pointer-events-auto"} hidden sm:flex items-center relative group`}
          style={{
            userSelect: "none",
            height: 100,
            boxSizing: "border-box",
            backdropFilter: "blur(24px) saturate(1.5)",
            WebkitBackdropFilter: "blur(24px) saturate(1.5)",
            borderRadius: 20,
            padding: "0 34px 0 0",
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

          {/* Foto fixa / área de entrada da animação */}
          <div
            style={{
              width: 82,
              height: "100%",
              position: "relative",
              flexShrink: 0,
              zIndex: 2,
            }}
          >
            {!photoSlide && (
              <div
                key={`${presenterKey}:${presenterIndex}`}
                style={{ width: "100%", height: "100%", position: "relative" }}
              >
                {currentPhoto ? (
                  <img
                    key={currentPhoto}
                    src={currentPhoto}
                    alt={currentName || "Locutor no ar"}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
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
            )}
          </div>

          {/* Foto de navegação: atravessa o box inteiro por trás dos textos */}
          {photoSlide && (
            <div
              key={photoSlide.key}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 1,
                overflow: "hidden",
                pointerEvents: "none",
              }}
            >
              {photoSlide.from && (
                <img
                  src={photoSlide.from}
                  alt=""
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: 82,
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "top center",
                    animation: `fmp-photo-exit-${photoSlide.direction} ${PHOTO_TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`,
                  }}
                />
              )}
              {photoSlide.to && (
                <img
                  src={photoSlide.to}
                  alt=""
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: photoSlide.direction === "forward" ? "calc(100% - 82px)" : -82,
                    width: 82,
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "top center",
                    animation: `fmp-photo-enter-${photoSlide.direction} ${PHOTO_TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`,
                  }}
                />
              )}
            </div>
          )}

          {/* Informações: sempre no mesmo box */}
          <div
            key={`schedule-${displayedInfo.programaKey}-${scheduleIndex ?? "live"}-${slideDirection}`}
            style={{
              position: "relative",
              zIndex: 3,
              minWidth: 0,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              paddingLeft: 10,
              paddingRight: 4,
              animation: isBrowsingSchedule
                ? `fmp-slide-${slideDirection} 420ms cubic-bezier(0.16, 1, 0.3, 1)`
                : undefined,
            }}
          >
            {!isBrowsingSchedule && (
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
            )}

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

          {/* Setas: dentro do próprio box, sem botão/caixa visível */}
          <button
            type="button"
            data-testid="previous-program-button"
            aria-label="Programa anterior"
            onClick={() => navigateSchedule("backward")}
            style={{
              position: "absolute",
              left: 7,
              top: "50%",
              transform: "translateY(-50%)",
              width: 20,
              height: 40,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              outline: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.92)",
              zIndex: 7,
            }}
            title="Programa anterior"
          >
            <ArrowRight size={16} style={{ transform: "rotate(180deg)" }} />
          </button>

          <button
            type="button"
            data-testid="next-program-button"
            aria-label="Próximo programa"
            onClick={() => navigateSchedule("forward")}
            style={{
              position: "absolute",
              right: 7,
              top: "50%",
              transform: "translateY(-50%)",
              width: 20,
              height: 40,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              outline: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.92)",
              zIndex: 7,
            }}
            title="Próximo programa"
          >
            <ArrowRight size={16} />
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
