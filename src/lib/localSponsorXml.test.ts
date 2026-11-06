import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { flattenLocalGeralXml, localGeralXml, localLogosXml } from "../../vite-plugins/localSponsorXml";

const logos = `<?xml version="1.0"?><estudio><programa_no_ar>
<id>123</id><nome>Programa</nome><estudio>FM</estudio>
<patrocinador><id>456</id><nome>A &amp; B</nome><url>https://example.test/logo.png?v=123</url></patrocinador>
<logo_url>https://example.test/logo.png?v=123</logo_url><indice>1</indice><total>2</total><intervalo_atualizacao>5</intervalo_atualizacao>
</programa_no_ar></estudio>`;

const parse = (xml: string): Document => new JSDOM(xml, { contentType: "text/xml" }).window.document;

describe("local sponsor feeds", () => {
  it("serves the corrected XML itself, not just a filtered XPath preview", () => {
    const document = parse(localLogosXml(logos));
    expect(document.querySelector("programa_no_ar > id")).toBeNull();
    expect(document.querySelector("patrocinador > id")).toBeNull();
    expect(document.querySelector("programa_no_ar > logo_url")).toBeNull();
    expect(document.querySelector("programa_no_ar > indice")).toBeNull();
    expect(document.querySelector("programa_no_ar > total")).toBeNull();
    expect(document.querySelector("programa_no_ar > intervalo_atualizacao")).toBeNull();
    expect(document.querySelector("patrocinador > url")).toBeNull();
    expect(document.querySelector("patrocinador > nome")?.textContent).toBe("A & B");
    expect(document.querySelector("patrocinador > logo_url")?.textContent).toBe("https://example.test/logo.png");
  });

  it("uses the same current sponsor in the general feed and removes the old lists", () => {
    const geral = `<geral versao="1.0"><estacao><nome>Emissora</nome><cidade>Cidade</cidade><frequencia>FM</frequencia><slug>estacao</slug></estacao><no_ar><musica_atual><titulo>Preservado</titulo><atualizado_em>horario</atualizado_em></musica_atual></no_ar><musica>Preservada</musica><patrocinadores><patrocinador><nome>Antigo</nome></patrocinador><programa_no_ar><programa_id>123</programa_id><programa_nome>Programa</programa_nome><patrocinador><nome>Antigo</nome></patrocinador></programa_no_ar></patrocinadores></geral>`;
    const document = parse(localGeralXml(geral, logos));
    expect(document.documentElement.hasAttribute("versao")).toBe(false);
    for (const selector of ["estacao_nome", "estacao_cidade", "estacao_frequencia", "musica_atual_atualizado_em", "patrocinadores_programa_no_ar_programa_id"]) {
      expect(document.querySelector(selector)).toBeNull();
    }
    expect(document.querySelector("estacao_slug")?.textContent).toBe("estacao");
    expect(document.querySelector("musica_atual_titulo")?.textContent).toBe("Preservado");
    expect(document.querySelector("patrocinadores_programa_no_ar_programa_nome")?.textContent).toBe("Programa");
    expect(document.querySelector("musica")?.textContent).toBe("Preservada");
    expect(document.querySelector("patrocinadores_programa_no_ar_patrocinador_nome")?.textContent).toBe("A & B");
    expect(document.querySelector("patrocinadores_programa_no_ar_patrocinador_logo_url")?.textContent).toBe("https://example.test/logo.png");
    expect(Array.from(document.documentElement.children).every(element => element.children.length === 0)).toBe(true);
  });

  it("preserves an already flattened upstream feed", () => {
    const xml = `<?xml version="1.0"?><geral><programa_atual_nome>Programa</programa_atual_nome><patrocinadores_programa_no_ar_patrocinador_nome>Atual</patrocinadores_programa_no_ar_patrocinador_nome></geral>`;
    expect(localGeralXml(xml, logos)).toBe(xml);
  });

  it("flattens the local static feed without requiring a logos feed", () => {
    const xml = `<geral><no_ar><programa_atual><nome>A &amp; B</nome></programa_atual></no_ar><roteiro ativo="0"></roteiro></geral>`;
    const document = parse(flattenLocalGeralXml(xml));
    expect(document.querySelector("programa_atual_nome")?.textContent).toBe("A & B");
    expect(document.querySelector("roteiro_ativo")?.textContent).toBe("0");
    expect(Array.from(document.documentElement.children).every(element => element.children.length === 0)).toBe(true);
    expect(() => flattenLocalGeralXml("<outro/>")).toThrow("XML geral inválido");
  });

  it("fails explicitly rather than returning an invalid or misleading PNG URL", () => {
    expect(() => localLogosXml(logos.replace("logo.png?v=123", "logo.webp"))).toThrow();
    expect(() => localLogosXml("<estudio/>")).toThrow();
  });
});
