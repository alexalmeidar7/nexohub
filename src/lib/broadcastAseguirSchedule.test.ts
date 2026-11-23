import { describe, it, expect } from "vitest";
import { resolveBroadcastAseguir, resolveManualAseguir } from "../../supabase/functions/_shared/broadcastAseguirSchedule";

const TZ = "America/Sao_Paulo";
const monday = ["Segunda"];
const programs = [
  { id: "a", nome: "Programa A", horario_inicio: "08:00", dias_semana: monday, estudio: "Estudio FM" },
  { id: "b", nome: "Programa B", horario_inicio: "09:00", dias_semana: monday, estudio: "Estudio FM" },
  { id: "c", nome: "Programa C", horario_inicio: "10:00", dias_semana: monday, estudio: "Estudio FM" },
  { id: "d", nome: "Programa D", horario_inicio: "11:00", dias_semana: monday, estudio: "Estudio FM" },
];
const at = (clock: string) => new Date("2026-11-23T" + clock + "-03:00");
describe("A Seguir vMix 45-second text pulses", () => {
  it("starts blank and sends next program exactly 10 minutes before its start", () => {
    expect(resolveBroadcastAseguir(programs, at("08:49:59"), TZ, true).t1).toBe("");
    const pulse = resolveBroadcastAseguir(programs, at("08:50:00"), TZ, true);
    expect([pulse.t1, pulse.t2, pulse.t3]).toEqual(["a seguir:", "Programa B", "09:00"]);
    expect(resolveBroadcastAseguir(programs, at("08:50:44"), TZ, true).t2).toBe("Programa B");
    expect(resolveBroadcastAseguir(programs, at("08:50:45"), TZ, true).t1).toBe("");
  });
  it("sends the second future program 30 minutes after the current begins", () => {
    const pulse = resolveBroadcastAseguir(programs, at("08:30:00"), TZ, true);
    expect([pulse.t1, pulse.t2, pulse.t3]).toEqual(["ainda hoje:", "Programa C", "10:00"]);
    expect(resolveBroadcastAseguir(programs, at("08:30:45"), TZ, true).t2).toBe("");
  });
  it("respects manually selected next and later targets for exactly 45 seconds", () => {
    expect(resolveManualAseguir(programs, at("08:15:00"), TZ, "next")?.t2).toBe("Programa B");
    expect(resolveManualAseguir(programs, at("08:15:00"), TZ, "later")?.t2).toBe("Programa C");
    const manual = { mode: "later" as const, triggered_at: at("08:15:00").toISOString(), expires_at: at("08:15:45").toISOString() };
    expect(resolveBroadcastAseguir(programs, at("08:15:10"), TZ, true, manual).t2).toBe("Programa C");
    expect(resolveBroadcastAseguir(programs, at("08:15:45"), TZ, true, manual).t2).toBe("");
    expect(resolveBroadcastAseguir(programs, at("08:15:10"), TZ, false, manual).t2).toBe("");
  });
  it("does not leak later announcements into the following day", () => {
    expect(resolveManualAseguir(programs, at("11:10:00"), TZ, "later")).toBeNull();
  });
  it("ignores podcast entries and inactive programs", () => {
    const extra = [...programs, { id:"pod", nome:"Podcast", horario_inicio:"08:52", dias_semana:monday, estudio:"Podcast" }];
    expect(resolveManualAseguir(extra, at("08:45:00"), TZ, "next")?.t2).toBe("Programa B");
  });
});
