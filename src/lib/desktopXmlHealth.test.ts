import { describe, it, expect } from "vitest";
import { isUsableXml, missingXmlPlaceholder } from "./desktopXmlHealth";
describe("HMD feed recovery", () => {
  it("creates a weather placeholder without hiding a failed feed", () => {
    expect(missingXmlPlaceholder("tempo.xml")).toContain("<previsao><disponivel>0</disponivel></previsao>");
  });
  it("rejects HTML, XML error documents and missing content", () => {
    expect(isUsableXml("<!DOCTYPE html><html>error</html>")).toBe(false);
    expect(isUsableXml("<error>unauthorized</error>")).toBe(false);
    expect(isUsableXml(null)).toBe(false);
    expect(isUsableXml("<previsao><disponivel>1</disponivel></previsao>")).toBe(true);
  });
});
