import { describe, expect, it } from "vitest";
import { noticiasComCampoFixo } from "../../../supabase/functions/_shared/roteiroNoticias";

describe("notícias do XML de roteiro", () => {
  const noticias = [
    { titulo: "Primeira notícia", imagemUrl: "imagem", escalada: true },
    { titulo: "Segunda notícia", imagemUrl: "", escalada: false },
  ];

  it("coloca o campo fixo no primeiro item do primeiro bloco sem alterar as notícias", () => {
    const resultado = noticiasComCampoFixo(noticias, "  Abertura & notícias  ", true);
    expect(resultado.map(item => item.titulo)).toEqual(["Abertura & notícias", "Primeira notícia", "Segunda notícia"]);
    expect(resultado[0]).toEqual({ titulo: "Abertura & notícias", imagemUrl: "", resumo: "", texto_materia: "", escalada: false });
    expect(noticias).toHaveLength(2);
  });

  it("mantém a lista original para roteiros antigos, campo vazio e outros blocos", () => {
    expect(noticiasComCampoFixo(noticias, undefined, true)).toEqual(noticias);
    expect(noticiasComCampoFixo(noticias, "  ", true)).toEqual(noticias);
    expect(noticiasComCampoFixo(noticias, "Abertura", false)).toEqual(noticias);
  });
});
