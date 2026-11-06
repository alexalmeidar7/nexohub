import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { localGeralXml, localLogosXml } from "../../vite-plugins/localSponsorXml";

const logos = `<?xml version="1.0"?><estudio><programa_no_ar>
<id>123</id><nome>Programa</nome><estudio>FM</estudio>
<patrocinador><id>456</id><nome>A &amp; B</nome><url>https://example.test/logo.png?v=123</url></patrocinador>
<logo_url>https://example.test/logo.png?v=123</logo_url><indice>1</indice><total>2</total><intervalo_atualizacao>5</intervalo_atualizacao>
</programa_no_ar></estudio>`;

const parse = (xml: string) => new JSDOM(xml, { contentType: "text/xml" }).window.document;

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
    const geral = `<geral><musica>Preservada</musica><patrocinadores><patrocinador><nome>Antigo</nome></patrocinador><programa_no_ar><programa_id>123</programa_id><patrocinador><nome>Antigo</nome></patrocinador></programa_no_ar></patrocinadores></geral>`;
    const document = parse(localGeralXml(geral, logos));
    expect(document.querySelector("musica")?.textContent).toBe("Preservada");
    expect(document.querySelectorAll("patrocinador")).toHaveLength(1);
    expect(document.querySelector("patrocinador > nome")?.textContent).toBe("A & B");
    expect(document.querySelector("patrocinador > logo_url")?.textContent).toBe("https://example.test/logo.png");
  });

  it("fails explicitly rather than returning an invalid or misleading PNG URL", () => {
    expect(() => localLogosXml(logos.replace("logo.png?v=123", "logo.webp"))).toThrow();
    expect(() => localLogosXml("<estudio/>")).toThrow();
  });
});
