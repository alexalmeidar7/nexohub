import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { flattenGeralXml } from "../../supabase/functions/_shared/flattenGeralXml";
import { listXPaths } from "./xmlXPath";

const parse = (xml: string): Document => new JSDOM(xml, { contentType: "text/xml" }).window.document;

describe("XML geral com campos diretos", () => {
  it("preserva valores, atributos e todos os itens de listas numeradas", () => {
    const xml = `<geral><no_ar><programa_atual><nome>A &amp; B</nome></programa_atual><historico_recente>
      <musica><titulo>Uma</titulo></musica><musica><titulo>Duas</titulo></musica>
      </historico_recente></no_ar><roteiro ativo="1"><blocos>
      <bloco numero="1"><noticia ordem="1"><titulo>Primeira</titulo></noticia><noticia ordem="2"><titulo>Segunda</titulo></noticia></bloco>
      <bloco numero="2"><noticia ordem="1"><titulo>Terceira</titulo></noticia></bloco>
      </blocos><participantes><participante><nome>Pessoa</nome></participante></participantes>
      <podcast><perguntas><pergunta ordem="1"></pergunta><pergunta ordem="2">Qual &lt;tema&gt;?</pergunta></perguntas></podcast></roteiro>
      <interatividade><quiz ativo="0"></quiz></interatividade></geral>`;
    const doc = parse(flattenGeralXml(xml));
    const text = (name: string) => doc.querySelector(name)?.textContent;
    expect(text("programa_atual_nome")).toBe("A & B");
    expect(text("historico_musica_1_titulo")).toBe("Uma");
    expect(text("historico_musica_2_titulo")).toBe("Duas");
    expect(text("roteiro_ativo")).toBe("1");
    expect(text("roteiro_blocos_bloco_1_numero")).toBe("1");
    expect(text("roteiro_blocos_bloco_1_noticia_2_titulo")).toBe("Segunda");
    expect(text("roteiro_blocos_bloco_2_noticia_1_titulo")).toBe("Terceira");
    expect(text("roteiro_participantes_participante_1_nome")).toBe("Pessoa");
    expect(text("roteiro_podcast_perguntas_pergunta_1_ordem")).toBe("1");
    expect(text("roteiro_podcast_perguntas_pergunta_1")).toBe("");
    expect(text("roteiro_podcast_perguntas_pergunta_2")).toBe("Qual <tema>?");
    expect(text("quiz_ativo")).toBe("0");
    expect(Array.from(doc.documentElement.children).every(node => node.children.length === 0)).toBe(true);
  });

  it("não muda o nome do primeiro item quando há somente um", () => {
    const doc = parse(flattenGeralXml("<geral><no_ar><historico_recente><musica><titulo>Uma</titulo></musica></historico_recente></no_ar></geral>"));
    expect(doc.querySelector("historico_musica_1_titulo")?.textContent).toBe("Uma");
  });

  it("aceita histórico vazio sem criar uma tag inválida", () => {
    const doc = parse(flattenGeralXml("<geral><no_ar><historico_recente>  </historico_recente></no_ar></geral>"));
    expect(doc.querySelector("historico")?.textContent?.trim()).toBe("");
  });

  it("apresenta os novos caminhos no seletor de XPath", () => {
    const xml = flattenGeralXml("<geral><no_ar><programa_atual><nome>Programa</nome></programa_atual></no_ar></geral>");
    expect(listXPaths(xml)).toContainEqual({ xpath: "/geral/programa_atual_nome", value: "Programa", kind: "element" });
  });

  it("numera todas as listas, inclusive com apenas um item", () => {
    const xml = `<geral><roteiro>
      <escalada><item ordem="1"><titulo>Notícia</titulo></item></escalada>
      <podcast><perguntas><pergunta ordem="1">Pergunta</pergunta></perguntas>
      <imagens_apoio><imagem>imagem</imagem></imagens_apoio><videos_apoio><video>vídeo</video></videos_apoio></podcast>
      </roteiro></geral>`;
    const doc = parse(flattenGeralXml(xml));
    for (const [name, value] of [
      ["roteiro_escalada_item_1_ordem", "1"],
      ["roteiro_escalada_item_1_titulo", "Notícia"],
      ["roteiro_podcast_perguntas_pergunta_1", "Pergunta"],
      ["roteiro_podcast_imagens_apoio_imagem_1", "imagem"],
      ["roteiro_podcast_videos_apoio_video_1", "vídeo"],
    ]) expect(doc.querySelector(name)?.textContent).toBe(value);
  });

  it("recusa colisões e XML inválido em vez de perder campos", () => {
    expect(() => flattenGeralXml("<geral><a_b>1</a_b><a><b>2</b></a></geral>")).toThrow("Campo duplicado");
    expect(() => flattenGeralXml("<geral><a></geral>")).toThrow();
  });
});
