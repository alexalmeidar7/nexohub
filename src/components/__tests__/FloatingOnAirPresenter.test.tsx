import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "station", email: "station@example.invalid" },
  program: { id: "program-1", nome: "Programa", horarioInicio: "08:00", horarioFim: "10:00", diasSemana: [], apresentadoresIds: ["a", "b"] },
  presenters: [
    { id: "a", nome: "Pessoa A", foto: "https://example.invalid/a.png" },
    { id: "b", nome: "Pessoa B", foto: "https://example.invalid/b.png" },
  ],
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/useAlbumColors", () => ({ useAlbumColors: () => [] }));
vi.mock("@/lib/stationDatabaseService", () => ({ getStationDatabaseSync: () => null }));
vi.mock("@/components/OnAirWidget", () => ({
  getProgramas: async () => [mocks.program],
  getProgramasSync: () => [],
  findCurrentProgram: () => null,
}));
vi.mock("@/components/ApresentadorForm", () => ({ getApresentadores: async () => mocks.presenters }));
vi.mock("@/lib/onAirResolver", () => ({
  getZonedNow: () => ({ weekday: 1, hhmm: "09:00" }),
  resolveEffectiveOnAir: (programs: unknown[]) => ({ current: programs[0], next: null }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    channel: () => channel,
    removeChannel: vi.fn(),
  } };
});

import FloatingOnAirPresenter from "../FloatingOnAirPresenter";

beforeEach(() => {
  vi.useFakeTimers();
  mocks.program = { id: "program-1", nome: "Programa", horarioInicio: "08:00", horarioFim: "10:00", diasSemana: [], apresentadoresIds: ["a", "b"] };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("apresentadores no ar", () => {
  it("alterna foto e nome a cada quatro segundos e reinicia ao mudar de programa", async () => {
    render(<FloatingOnAirPresenter />);
    await act(async () => {});
    expect(screen.getByAltText("Pessoa A")).toHaveAttribute("src", "https://example.invalid/a.png");
    await act(async () => { vi.advanceTimersByTime(2000); window.dispatchEvent(new Event("apresentadores-updated")); });
    await act(async () => { vi.advanceTimersByTime(1300); });
    expect(screen.getByAltText("Pessoa A").parentElement).toHaveStyle({ transform: "translateX(-100%)" });
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(screen.getByAltText("Pessoa B")).toHaveAttribute("src", "https://example.invalid/b.png");
    expect(screen.getByTitle("Pessoa B")).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(screen.getByAltText("Pessoa A")).toBeInTheDocument();
    mocks.program = { ...mocks.program, id: "program-2", apresentadoresIds: ["b"] };
    await act(async () => { window.dispatchEvent(new Event("apresentadores-updated")); });
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(screen.getByAltText("Pessoa B")).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(8000); });
    expect(screen.getByAltText("Pessoa B")).toBeInTheDocument();
  });

  it("não mostra a foto do primeiro quando o próximo participante não tem foto", async () => {
    const original = mocks.presenters[1].foto;
    mocks.presenters[1].foto = "";
    try {
      render(<FloatingOnAirPresenter />);
      await act(async () => {});
      await act(async () => { vi.advanceTimersByTime(4000); });
      expect(screen.queryByAltText("Pessoa A")).not.toBeInTheDocument();
      expect(screen.getByTitle("Pessoa B")).toBeInTheDocument();
    } finally {
      mocks.presenters[1].foto = original;
    }
  });
});
