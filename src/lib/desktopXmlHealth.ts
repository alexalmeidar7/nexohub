/** Minimal XML health checks shared by all HMD feed downloads. */
const ROOTS: Record<string, string> = {
  "geral.xml": "geral", "tempo.xml": "previsao", "roteiro.xml": "roteiro",
  "musica.xml": "broadcast", "logos.xml": "logos", "broadcast.xml": "broadcast",
  "batalha.xml": "batalha", "enquete.xml": "enquete", "cenarios-estudio.xml": "cenarios",
  "quiz.xml": "quiz", "tclock-shows.xml": "tclock_shows", "vmix-live.xml": "vmix_live",
};
export function isUsableXml(xml: unknown): xml is string {
  return typeof xml === "string" && xml.trim().startsWith("<") &&
    !/<(?:!doctype|html|error|parsererror)\b/i.test(xml) && xml.length <= 5_000_000 &&
    /<([a-z_][\w:.-]*)\b[^>]*>/i.test(xml);
}
export function missingXmlPlaceholder(filename: string): string {
  const root = ROOTS[filename] || "housemix";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root}><disponivel>0</disponivel></${root}>\n`;
}
