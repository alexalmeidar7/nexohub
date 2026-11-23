/**
 * Cost-free text generation in the Windows HMD.
 * Calling one of these named actions never falls back to Supabase / OpenAI:
 * without a local Ollama model it returns a local error instead.
 */
type DesktopResponse = { data: unknown; error: Error | null };
function stripFence(value: string) {
  return value.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}
export async function invokeDesktopFreeAi(name: string, payload: unknown): Promise<DesktopResponse | null> {
  const desktop = typeof window !== "undefined" ? window.houseMixDesktop : undefined;
  if (!desktop?.generateLocalText) return null;
  if (!["get-music-curiosity", "summarize-news", "generate-enquetes"].includes(name)) return null;
  const input = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const value = (key: string, limit = 350) =>
    typeof input[key] === "string" ? String(input[key]).trim().slice(0, limit) : "";
  let system = "";
  let prompt = "";
  if (name === "get-music-curiosity") {
    const artista = value("artista"), musica = value("musica");
    if (!artista || !musica) return { data: null, error: new Error("Dados da música incompletos.") };
    system = "Você é um locutor brasileiro. Retorne uma única curiosidade curta em português (até 15 palavras), sem inventar fatos, sem títulos e sem aspas.";
    prompt = `Artista: ${artista}. Música: ${musica}.`;
  } else if (name === "summarize-news") {
    system = "Resuma notícias em português. Retorne SOMENTE um JSON com as chaves resumo e tempo_leitura; no máximo duas frases.";
    prompt = `Notícia: ${value("title", 250)}\n${value("content", 4800)}`;
    if (!prompt.trim() || prompt.trim() === "Notícia:") return { data: null, error: new Error("Notícia vazia.") };
  } else {
    const category = value("categoria", 250);
    if (!category) return { data: null, error: new Error("Categoria vazia.") };
    system = "Gere exclusivamente JSON válido: array de 5 questões de quiz em português, cada uma com pergunta, respostas (duas strings) e correta (1 ou 2).";
    prompt = `Tema: ${category}. Cinco perguntas factuais, curtas, adequadas a uma rádio. Não invente informações.`;
  }
  try {
    const output = await desktop.generateLocalText(system, prompt);
    if (name === "get-music-curiosity") {
      return { data: { curiosidade: output.trim().slice(0, 450), cached: false, local: true }, error: null };
    }
    const parsed = JSON.parse(stripFence(output));
    if (name === "summarize-news") {
      if (!parsed || typeof parsed.resumo !== "string") throw new Error("invalid_local_ai_json");
      return { data: { resumo: parsed.resumo.slice(0, 750), tempo_leitura: String(parsed.tempo_leitura || "1 min").slice(0, 30) }, error: null };
    }
    if (!Array.isArray(parsed) || parsed.length !== 5 || !parsed.every(row =>
      row && typeof row.pergunta === "string" && Array.isArray(row.respostas) &&
      row.respostas.length === 2 && row.respostas.every((x: unknown) => typeof x === "string") &&
      (row.correta === 1 || row.correta === 2))) throw new Error("invalid_local_quiz_json");
    return { data: parsed, error: null };
  } catch {
    return { data: null, error: new Error("IA local indisponível. Instale/inicie o Ollama e baixe o modelo configurado; nenhuma API paga foi chamada.") };
  }
}
