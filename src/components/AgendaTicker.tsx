import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface Layer {
  id: number;
  text: string;
  isNow: boolean;
  leaving: boolean;
}

const TRANSITION_MS = 520;

// Texto que entra por baixo e sai por cima; a largura acompanha o texto com transição suave.
export default function AgendaTicker({ text, isNow = false }: { text: string; isNow?: boolean }) {
  const [layers, setLayers] = useState<Layer[]>([{ id: 0, text, isNow, leaving: false }]);
  const [width, setWidth] = useState<number | null>(null);
  const seq = useRef(0);
  const measureRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setLayers((current) => {
      const active = current.find((l) => !l.leaving);
      if (active?.text === text && active.isNow === isNow) return current;
      seq.current += 1;
      return [
        ...current.map((l) => ({ ...l, leaving: true })),
        { id: seq.current, text, isNow, leaving: false },
      ];
    });
    const timer = setTimeout(() => {
      setLayers((current) => current.filter((l) => !l.leaving));
    }, TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [text, isNow]);

  useLayoutEffect(() => {
    if (measureRef.current) setWidth(Math.ceil(measureRef.current.getBoundingClientRect().width));
  }, [text, isNow]);

  const content = (value: string, now: boolean) => (
    <>
      {now && (
        <span className="inline-flex items-center rounded-md bg-green-700 px-1.5 mr-1.5 text-white leading-4">
          <span className="motion-safe:animate-pulse">AGORA</span>
        </span>
      )}
      {value}
    </>
  );

  return (
    <span
      className="relative block min-w-0 overflow-hidden"
      style={{
        height: "1.25rem",
        lineHeight: "1.25rem",
        width: width ?? undefined,
        maxWidth: "100%",
        transition: `width ${TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
      }}
    >
      <span
        ref={measureRef}
        aria-hidden
        className="invisible absolute left-0 top-0 whitespace-nowrap"
        style={{ pointerEvents: "none" }}
      >
        {content(text, isNow)}
      </span>
      {layers.map((layer) => (
        <span
          key={layer.id}
          className="absolute left-0 top-0 max-w-full truncate whitespace-nowrap"
          style={{
            animation: `${layer.leaving ? "agenda-ticker-out" : "agenda-ticker-in"} ${TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
          }}
        >
          {content(layer.text, layer.isNow)}
        </span>
      ))}
    </span>
  );
}
