import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

/**
 * Regressão: as setas "Programa anterior" / "Próximo programa" que ficam
 * dentro do card NO AR devem disparar seus handlers de clique SEM que o
 * container de swipe (pai) receba o pointerdown — caso contrário o
 * setPointerCapture do swipe engolia o clique.
 *
 * Este harness reproduz o padrão real usado em AudioPlayerScreen.tsx:
 *  - Container externo com onPointerDown (simula swipe).
 *  - Pill central com onPointerDown/Move/Up + stopPropagation.
 *  - Botões de seta com onPointerDown={stopPropagation} + onClick.
 */
function Harness({
  onSwipeDown,
  onPrev,
  onNext,
}: {
  onSwipeDown: (e: React.PointerEvent) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div
      data-testid="swipe-container"
      onPointerDown={onSwipeDown}
      style={{ width: 400, height: 300 }}
    >
      <div
        data-testid="nav-pill"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Programa anterior"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Próximo programa"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
        >
          ›
        </button>
      </div>
    </div>
  );
}

describe("AudioPlayerScreen — setas NO AR não são engolidas pelo swipe", () => {
  it("clicar em 'Programa anterior' dispara onPrev e NÃO propaga pointerdown ao swipe", () => {
    const onSwipeDown = vi.fn();
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<Harness onSwipeDown={onSwipeDown} onPrev={onPrev} onNext={onNext} />);

    const prev = screen.getByLabelText("Programa anterior");
    fireEvent.pointerDown(prev);
    fireEvent.click(prev);

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
    expect(onSwipeDown).not.toHaveBeenCalled();
  });

  it("clicar em 'Próximo programa' dispara onNext e NÃO propaga pointerdown ao swipe", () => {
    const onSwipeDown = vi.fn();
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<Harness onSwipeDown={onSwipeDown} onPrev={onPrev} onNext={onNext} />);

    const next = screen.getByLabelText("Próximo programa");
    fireEvent.pointerDown(next);
    fireEvent.click(next);

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).not.toHaveBeenCalled();
    expect(onSwipeDown).not.toHaveBeenCalled();
  });

  it("pointerdown fora da pill AINDA aciona o swipe (não quebramos o gesto)", () => {
    const onSwipeDown = vi.fn();
    render(
      <Harness
        onSwipeDown={onSwipeDown}
        onPrev={() => {}}
        onNext={() => {}}
      />
    );
    fireEvent.pointerDown(screen.getByTestId("swipe-container"));
    expect(onSwipeDown).toHaveBeenCalledTimes(1);
  });
});
