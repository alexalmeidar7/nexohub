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
});
