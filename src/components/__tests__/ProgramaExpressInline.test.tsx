import { describe, expect, it } from "vitest";
import { hasInformationalContent } from "../ProgramaExpressInline";

describe("ProgramaExpressInline - validação de conteúdo", () => {
  it("bloqueia roteiro sem notícias ou conteúdo informativo", () => {
    expect(hasInformationalContent([{ noticias: [{ titulo: "", texto_materia: "" }] }])).toBe(false);
    expect(hasInformationalContent([{ noticias: [{ titulo: "   ", texto_materia: "  " }] }])).toBe(false);
    expect(hasInformationalContent([])).toBe(false);
  });

  it("permite roteiro com título de notícia", () => {
    expect(hasInformationalContent([{ noticias: [{ titulo: "Notícia de teste" }] }])).toBe(true);
  });

  it("permite roteiro com texto de matéria mesmo sem título", () => {
    expect(hasInformationalContent([{ noticias: [{ titulo: "", texto_materia: "Conteúdo da matéria" }] }])).toBe(true);
  });

  it("considera notícias em qualquer bloco", () => {
    expect(hasInformationalContent([
      { noticias: [{ titulo: "" }] },
      { noticias: [{ titulo: "Notícia no segundo bloco" }] },
    ])).toBe(true);
  });
});
