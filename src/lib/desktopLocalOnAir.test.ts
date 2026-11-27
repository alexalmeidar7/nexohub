// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({supabase:{}}));
import { selectLocalProgram } from "./desktopLocalOnAir";
const program = (id:string, inicio:string, fim:string, dias:string[]) => ({id,user_id:"station",nome:id,ativo:true,estudio:"Estúdio FM",horario_inicio:inicio,horario_fim:fim,dias_semana:dias});
describe("grade local no ar", () => {
  it("troca exatamente no segundo de início, sem um minuto de espera", () => {
    const rows = [program("antes","10:00","11:00",["Sexta"]),program("depois","11:00","12:00",["Sexta"])];
    expect(selectLocalProgram(rows,Date.parse("2026-11-27T13:59:59Z"))?.id).toBe("antes");
    expect(selectLocalProgram(rows,Date.parse("2026-11-27T14:00:00Z"))?.id).toBe("depois");
  });
  it("mantém o programa iniciado no dia anterior após meia-noite", () => {
    expect(selectLocalProgram([program("madrugada","23:00","02:00",["Quinta"])],Date.parse("2026-11-27T03:00:00Z"))?.id).toBe("madrugada");
  });
  it("não usa programa do Podcast no FM", () => {
    const p = {...program("podcast","10:00","12:00",["Sexta"]),estudio:"Podcast"};
    expect(selectLocalProgram([p],Date.parse("2026-11-27T14:00:00Z"))).toBeNull();
  });
});
