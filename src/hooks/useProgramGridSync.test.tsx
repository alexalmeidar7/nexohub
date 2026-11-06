import { act, renderHook, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProgramGridSync } from "./useProgramGridSync";

const realtime = vi.hoisted(() => ({ callback: undefined as (() => void) | undefined, remove: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: (_type: string, _filter: unknown, callback: () => void) => {
        realtime.callback = callback;
        return { subscribe: () => ({}) };
      },
    })),
    removeChannel: realtime.remove,
  },
}));

afterEach(() => {
  realtime.callback = undefined;
  realtime.remove.mockClear();
});

describe("sincronização dos presets com a grade", () => {
  it("atualiza horários, locutor, inclusão e exclusão após avisos de salvamento", async () => {
    let grade = [{ id: "1", horario: "08:00", locutor: "Ana" }];
    const load = vi.fn(async () => grade.map((programa) => ({ ...programa })));
    const { result, unmount } = renderHook(() => {
      const [programas, setProgramas] = useState<typeof grade>([]);
      const refresh = useCallback(async () => setProgramas(await load()), []);
      useProgramGridSync("emissora", refresh);
      return programas;
    });

    await waitFor(() => expect(result.current).toEqual(grade));
    grade = [{ id: "1", horario: "09:00", locutor: "Bia" }, { id: "2", horario: "10:00", locutor: "Caio" }];
    act(() => window.dispatchEvent(new CustomEvent("nexohub:programas-updated")));
    await waitFor(() => expect(result.current).toEqual(grade));

    grade = grade.filter((programa) => programa.id !== "1");
    act(() => window.dispatchEvent(new CustomEvent("housemix:programas-updated")));
    await waitFor(() => expect(result.current).toEqual(grade));

    grade = [{ id: "3", horario: "11:00", locutor: "Dani" }];
    act(() => realtime.callback?.());
    await waitFor(() => expect(result.current).toEqual(grade));

    unmount();
    const calls = load.mock.calls.length;
    act(() => window.dispatchEvent(new CustomEvent("nexohub:programas-updated")));
    expect(load).toHaveBeenCalledTimes(calls);
    expect(realtime.remove).toHaveBeenCalledOnce();
  });

  it("agrupa avisos recebidos durante uma consulta sem sobrepor requisições", async () => {
    let complete: (() => void) | undefined;
    const load = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve; }))
      .mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useProgramGridSync("emissora", load));
    act(() => {
      window.dispatchEvent(new Event("nexohub:programas-updated"));
      window.dispatchEvent(new Event("housemix:programas-updated"));
      realtime.callback?.();
    });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => { complete?.(); });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    unmount();
  });
});
