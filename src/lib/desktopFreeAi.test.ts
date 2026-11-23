import { afterEach, describe, expect, it, vi } from "vitest";
import { invokeDesktopFreeAi } from "./desktopFreeAi";

afterEach(() => { vi.unstubAllGlobals(); });
describe("local HMD AI avoids paid providers", () => {
  it("handles music curiosity without a Supabase request", async () => {
    const local = vi.fn(async () => "Curiosidade gerada inteiramente no computador.");
    vi.stubGlobal("window", { houseMixDesktop: { generateLocalText: local } });
    const result = await invokeDesktopFreeAi("get-music-curiosity", { artista: "Cantor", musica: "Música" });
    expect(result?.error).toBeNull();
    expect(result?.data).toMatchObject({ local: true, curiosidade: "Curiosidade gerada inteiramente no computador." });
    expect(local).toHaveBeenCalledTimes(1);
  });
  it("never sends an unavailable local AI request to a billable fallback", async () => {
    const local = vi.fn(async () => { throw new Error("missing model"); });
    vi.stubGlobal("window", { houseMixDesktop: { generateLocalText: local } });
    const result = await invokeDesktopFreeAi("get-music-curiosity", { artista: "A", musica: "B" });
    expect(result?.data).toBeNull();
    expect(result?.error?.message).toContain("nenhuma API paga");
  });
  it("validates quiz structure and summarization JSON", async () => {
    const quiz = Array.from({length:5}, (_,i) => ({ pergunta: String(i), respostas: ["sim","não"], correta: 1 }));
    const local = vi.fn().mockResolvedValueOnce(JSON.stringify(quiz)).mockResolvedValueOnce('{"resumo":"ok","tempo_leitura":"1 min"}');
    vi.stubGlobal("window", { houseMixDesktop: { generateLocalText: local } });
    expect((await invokeDesktopFreeAi("generate-enquetes", { categoria:"esportes" }))?.data).toEqual(quiz);
    expect((await invokeDesktopFreeAi("summarize-news", { title:"notícia" }))?.data).toEqual({ resumo:"ok", tempo_leitura:"1 min" });
    expect(await invokeDesktopFreeAi("unrelated", {})).toBeNull();
  });
});
