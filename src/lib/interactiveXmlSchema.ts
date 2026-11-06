import { listXPaths, type XPathEntry } from "./xmlXPath";

export type InteractiveXmlFeed = "batalha" | "enquete" | "quiz";

const fields: Record<InteractiveXmlFeed, { root: string; fields: string[] }> = {
  batalha: {
    root: "batalha",
    fields: ["emissora", "artista1_nome", "artista1_musica", "artista1_porcentagem", "artista1_imagem", "artista2_nome", "artista2_musica", "artista2_porcentagem", "artista2_imagem", "horario_inicio", "horario_fim"],
  },
  enquete: {
    root: "enquete",
    fields: ["pergunta", "resposta1", "resposta2", "resposta3", "resposta4", "resposta_correta", "horario_inicio", "horario_fim"],
  },
  quiz: {
    root: "dados",
    fields: ["pergunta", "resposta1", "resposta2", "resposta3", "resposta4", "resposta_correta", "resposta_correta_texto", "horario_inicio", "horario_fim", "explicacao", "imagem_resposta"],
  },
};

export function interactiveXmlSchema(feed: InteractiveXmlFeed): XPathEntry[] {
  const { root, fields: names } = fields[feed];
  return listXPaths(`<items><${root}>${names.map((name) => `<${name}></${name}>`).join("")}</${root}></items>`);
}
