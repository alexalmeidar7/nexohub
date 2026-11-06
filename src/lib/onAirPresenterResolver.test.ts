import { describe, expect, it } from "vitest";
import {
  resolvePresenterForProgram,
  resolveSafePresenterPhoto,
} from "./onAirPresenterResolver";

describe("presenter photo resolution by station account", () => {
  const interativaUserId = "9cab6c46-c32a-4c19-94db-773dcfaf7632";

  it.each([
    ["programa no ar", "Maratona"],
    ["programa a seguir", "Mega Bônus"],
  ])("resolves the Interativa presenter photo for %s", (_box, programName) => {
    const presenter = resolvePresenterForProgram(
      { nome: programName },
      [],
      interativaUserId,
    );

    expect(presenter?.nome).toBe("Ani Cristine");
    expect(resolveSafePresenterPhoto(
      presenter?.foto,
      presenter?.nome,
      interativaUserId,
    )).toBe("/locutores/ani.png");
  });

  it("does not use a presenter photo from another station", () => {
    const positivaUserId = "452ebd1e-61a0-42dd-bf80-231a3f426c83";

    expect(resolveSafePresenterPhoto("", "Ani Cristine", positivaUserId)).toBe("");
  });

  it.each([
    { nome: "Hora do Cafézin" },
    { nome: "Hora do Cafézin", apresentador_id: "43af147d-f4fc-4e9c-ad28-c8366b9d2970" },
  ])("prefers the registered photo when the canonical presenter has another id", (program) => {
    const registered = {
      id: "registered-id",
      nome: "Andre Rodrigues",
      foto: "https://example.invalid/registered.webp",
      stationKey: "INTERATIVA FM",
    };
    const presenter = resolvePresenterForProgram(program, [registered], interativaUserId);
    expect(presenter?.id).toBe(registered.id);
    expect(resolveSafePresenterPhoto(presenter?.foto, presenter?.nome, interativaUserId)).toBe(registered.foto);
  });

  it("does not use a matching presenter from another station", () => {
    const presenter = resolvePresenterForProgram(
      { nome: "Hora do Cafézin", apresentador_id: "43af147d-f4fc-4e9c-ad28-c8366b9d2970" },
      [{ id: "43af147d-f4fc-4e9c-ad28-c8366b9d2970", nome: "Andre Rodrigues", foto: "https://example.invalid/other.webp", stationKey: "POSITIVA FM" }],
      interativaUserId,
    );
    expect(presenter?.foto).toBe("/locutores/andre.png");
  });

  it("does not guess between duplicate registered names", () => {
    const presenter = resolvePresenterForProgram(
      { nome: "Hora do Cafézin" },
      [
        { id: "a", nome: "Andre Rodrigues", foto: "https://example.invalid/a.webp" },
        { id: "b", nome: "Andre Rodrigues", foto: "https://example.invalid/b.webp" },
      ],
      interativaUserId,
    );
    expect(presenter?.foto).toBe("/locutores/andre.png");
  });
});
