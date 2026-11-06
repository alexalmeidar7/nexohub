import { describe, expect, it } from "vitest";
import {
  logosXml, pngSponsorUrl, rotationTime, selectOnAirProgram, selectRotatingSponsor, sponsorXml,
  type ScheduledProgram, type SponsorLogo,
} from "../../supabase/functions/_shared/sponsorRotation";

const program: ScheduledProgram = {
  id: "fm", nome: "No ar", estudio: "Estúdio FM",
  dias_semana: ["Sexta"], horario_inicio: "08:00:00", horario_fim: "10:00:00",
};
const logos: SponsorLogo[] = [
  { id: "b", nome: "Dois", logo_url: "b.png", programa_id: "fm", data_final: "2026-11-06", created_at: "2026-01-01" },
  { id: "a", nome: "Um", logo_url: "a.png", programa_id: "fm", data_final: "2026-11-07", created_at: "2026-01-01" },
  { id: "c", nome: "Expirado", logo_url: "c.png", programa_id: "fm", data_final: "2026-11-05", created_at: "2026-01-01" },
  { id: "d", nome: "Outro", logo_url: "d.png", programa_id: "outro", data_final: "2026-11-07", created_at: "2026-01-01" },
  { id: "e", nome: "Geral", logo_url: "e.png", programa_id: null, data_final: "2026-11-07", created_at: "2026-01-01" },
];

describe("rodízio de patrocinadores", () => {
  it("uses the same sorted sponsor during a five-second slot and advances at the boundary", () => {
    const time = new Date("2026-11-06T11:00:00.000Z");
    const first = selectRotatingSponsor(logos, "fm", time);
    expect(selectRotatingSponsor([...logos].reverse(), "fm", new Date(time.getTime() + 4999))).toEqual(first);
    const next = selectRotatingSponsor(logos, "fm", new Date(time.getTime() + 5000));
    expect(next?.id).not.toBe(first?.id);
    expect([first?.id, next?.id].sort()).toEqual(["a", "b"]);
  });

  it("does not select sponsors from other programs, without a program, or after expiry", () => {
    const time = new Date("2026-11-06T11:00:00Z");
    expect(selectRotatingSponsor(logos, null, time)).toBeNull();
    expect(selectRotatingSponsor(logos.filter((logo) => logo.id === "c"), "fm", time)).toBeNull();
    expect(selectRotatingSponsor(logos, "inexistente", time)).toBeNull();
    expect(rotationTime(time).today).toBe("2026-11-06");
  });

  it("prefers FM, handles overnight programs and excludes the ending instant", () => {
    const time = new Date("2026-11-06T11:00:00Z");
    const other = { ...program, id: "outro", estudio: "Podcast", horario_inicio: "07:00:00" };
    expect(selectOnAirProgram([other, program], time)?.id).toBe("fm");
    expect(selectOnAirProgram([program], new Date("2026-11-06T13:00:00Z"))).toBeNull();
    const overnight = { ...program, horario_inicio: "23:00:00", horario_fim: "01:00:00" };
    expect(selectOnAirProgram([overnight], new Date("2026-11-07T03:30:00Z"))?.id).toBe("fm");
  });

  it("emits exactly one sponsor with both escaped fields, including when empty", () => {
    const xml = new DOMParser().parseFromString(`<root>${sponsorXml("A & B", "https://example.test/x?a=1&b=2")}</root>`, "text/xml");
    expect(xml.querySelectorAll("patrocinador")).toHaveLength(1);
    expect(xml.querySelector("patrocinador > nome")?.textContent).toBe("A & B");
    expect(xml.querySelector("patrocinador > logo_url")?.textContent).toBe("https://example.test/x?a=1&b=2");
    const empty = new DOMParser().parseFromString(`<root>${sponsorXml(null, "")}</root>`, "text/xml");
    expect(empty.querySelector("patrocinador > nome")?.textContent).toBe("");
    expect(empty.querySelector("patrocinador > logo_url")?.textContent).toBe("");
  });

  it("strips cache-busting parameters and rejects non-PNG sponsor URLs", () => {
    expect(pngSponsorUrl("https://example.test/logo.png?v=123#section")).toBe("https://example.test/logo.png");
    expect(pngSponsorUrl("https://example.test/logo.PNG")).toBe("https://example.test/logo.PNG");
    expect(() => pngSponsorUrl("https://example.test/logo.webp")).toThrow();
    expect(() => pngSponsorUrl("")).toThrow();
  });

  it("returns only the requested sponsor fields in the logos XML", () => {
    const url = pngSponsorUrl("https://example.test/logo.png?v=123");
    const xml = new DOMParser().parseFromString(logosXml(program, logos[0], url, new Date("2026-11-06T11:00:00Z")), "text/xml");
    expect(xml.querySelectorAll("patrocinador")).toHaveLength(1);
    expect(xml.querySelector("programa_no_ar > id")).toBeNull();
    expect(xml.querySelector("patrocinador > id")).toBeNull();
    expect(xml.querySelector("programa_no_ar > logo_url")).toBeNull();
    expect(xml.querySelector("patrocinador > nome")?.textContent).toBe("Dois");
    expect(xml.querySelector("patrocinador > logo_url")?.textContent).toBe("https://example.test/logo.png");
  });
});
