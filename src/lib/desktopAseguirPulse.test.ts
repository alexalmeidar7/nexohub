import { describe, it, expect } from "vitest";
import { expireAseguirXml, readAseguirPulseTimes } from "./desktopAseguirPulse";
const xml = '<items><dados><programa_nome>No ar</programa_nome><aseguir_t1>a seguir:</aseguir_t1><aseguir_t2>Programa</aseguir_t2><aseguir_t3>09:00</aseguir_t3><aseguir_expira_em>2026-11-23T12:00:45.000Z</aseguir_expira_em><aseguir_proximo_disparo_em>2026-11-23T12:30:00.000Z</aseguir_proximo_disparo_em><a_seguir><ativo>1</ativo><programa_nome>Programa</programa_nome><horario>09:00</horario></a_seguir></dados></items>';
describe("HMD local A Seguir timeout", () => {
  it("uses the server's absolute deadlines", () => {
    expect(readAseguirPulseTimes(xml)).toEqual({
      expiresAt: Date.parse("2026-11-23T12:00:45.000Z"),
      nextTriggerAt: Date.parse("2026-11-23T12:30:00.000Z"),
    });
  });
  it("clears expired values without touching other Broadcast XML fields", () => {
    const cleared = expireAseguirXml(xml);
    expect(cleared).toContain("<aseguir_t1></aseguir_t1>");
    expect(cleared).toContain("<aseguir_t2></aseguir_t2>");
    expect(cleared).toContain("<aseguir_t3></aseguir_t3>");
    expect(cleared).toContain("<programa_nome>No ar</programa_nome>");
    expect(cleared).toContain("<a_seguir><ativo>1</ativo><programa_nome></programa_nome>");
  });
});
