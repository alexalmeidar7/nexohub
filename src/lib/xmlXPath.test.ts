import { describe, expect, it } from "vitest";
import { evaluateXPath, listXPaths, parseXml } from "./xmlXPath";

const xml = `<?xml version="1.0"?>
<geral>
  <musica><titulo>Song</titulo></musica>
  <itens><item id="1"><nome>A</nome></item><item id="2"><nome>B</nome></item></itens>
</geral>`;

describe("xmlXPath", () => {
  it("lists leaf nodes and attributes with indexed paths", () => {
    const paths = listXPaths(xml).map(e => e.xpath);
    expect(paths).toContain("/geral/musica/titulo");
    expect(paths).toContain("/geral/itens/item[2]/nome");
    expect(paths).toContain("/geral/itens/item[1]/@id");
  });

  it("returns the value the XPath evaluates to", () => {
    const entry = listXPaths(xml).find(e => e.xpath === "/geral/itens/item[2]/nome");
    expect(entry?.value).toBe("B");
    expect(evaluateXPath(parseXml(xml), "/geral/musica/titulo")).toBe("Song");
  });

  it("rejects invalid XML", () => {
    expect(() => listXPaths("<a>")).toThrow();
  });
});
