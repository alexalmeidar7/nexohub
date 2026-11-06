import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), success: vi.fn(), info: vi.fn(), error: vi.fn(), user: { id: "owner-test", email: "test@example.invalid" } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/clientAuthAccounts", () => ({ findClientAccountById: () => null, findClientAccountByEmail: () => null }));
vi.mock("@/components/ApresentadorForm", () => ({ getApresentadores: vi.fn().mockResolvedValue([]) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, info: mocks.info, error: mocks.error, warning: vi.fn() } }));

import ProgramaExpressInline from "../ProgramaExpressInline";

const noticia = { titulo: "Notícia original", imagemUrl: "", escalada: false, texto_materia: "Texto preservado", link: "https://example.invalid", metadado: "preservado" };
const programa = { id: "programa-test", nome: "Programa teste", estudio: "Estudio FM", tipo_programa: "Jornalístico" };
const props = {
  programas: [programa],
  estudios: ["Estudio FM"],
  onFinish: vi.fn(),
  novoOpen: true,
  editData: {
    roteiroId: "roteiro-test",
    estudio: "Estudio FM",
    programaId: programa.id,
    blocos: [{ noticias: [noticia] }],
    participantes: [{ nome: "Pessoa", cargo: "", instagram: "" }],
    dadosAdicionais: { campoFixo: "Abertura", propriedadeExistente: "preservada" },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "not", "order", "limit", "is"]) query[method] = vi.fn(() => query);
  query.single = vi.fn().mockResolvedValue({ data: null, error: null });
  query.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
  const updateQuery = {
    eq: vi.fn(function (this: unknown) { return this; }),
    select: vi.fn().mockResolvedValue({ data: [{ id: "roteiro-test" }], error: null }),
  };
  mocks.update.mockReturnValue(updateQuery);
  mocks.from.mockReturnValue({ ...query, update: mocks.update });
});
afterEach(cleanup);

describe("edição de notícias arquivadas", () => {
  it("confirma, persiste e restaura a notícia sem perder os dados", async () => {
    const view = render(<ProgramaExpressInline {...props} />);
    expect(await screen.findByLabelText("Campo fixo")).toHaveValue("Abertura");
    fireEvent.change(screen.getByLabelText("Campo fixo"), { target: { value: "Abertura & notícias" } });
    fireEvent.click(screen.getByTitle("Remover (Delete)"));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("Notícia original")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Remover (Delete)"));
    fireEvent.click(screen.getByRole("button", { name: "Arquivar notícia" }));
    expect(await screen.findByText("Notícias arquivadas")).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalled();
      const saved = JSON.parse(mocks.update.mock.calls.at(-1)![0].participantes);
      expect(saved.blocos[0].noticias).toEqual([]);
      expect(saved.noticiasArquivadas[0].noticia).toMatchObject(noticia);
      expect(saved.campoFixo).toBe("Abertura & notícias");
      expect(saved.propriedadeExistente).toBe("preservada");
    }, { timeout: 5000 });
    const saved = JSON.parse(mocks.update.mock.calls.at(-1)![0].participantes);
    view.unmount();
    render(<ProgramaExpressInline {...props} editData={{ ...props.editData, blocos: saved.blocos, dadosAdicionais: saved }} />);
    expect(await screen.findByLabelText("Campo fixo")).toHaveValue("Abertura & notícias");
    expect(await screen.findByText("Notícias arquivadas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
    expect(screen.queryByText("Notícias arquivadas")).not.toBeInTheDocument();
    await waitFor(() => {
      const restored = JSON.parse(mocks.update.mock.calls.at(-1)![0].participantes);
      expect(restored.blocos[0].noticias.some((item: typeof noticia) => item.titulo === noticia.titulo && item.texto_materia === noticia.texto_materia)).toBe(true);
      expect(restored.noticiasArquivadas[0].restaurada).toBe(true);
    }, { timeout: 5000 });
  }, 15000);
});
