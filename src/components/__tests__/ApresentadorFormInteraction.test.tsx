import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "owner-test", email: "test@example.invalid" } }),
}));
vi.mock("@/lib/clientAuthAccounts", () => ({
  findClientAccountById: () => null,
  findClientAccountByEmail: () => null,
}));
vi.mock("@/lib/stationParticipantesData", () => ({ DEFAULT_STATION_PARTICIPANTES: {} }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

import ApresentadorForm from "@/components/ApresentadorForm";

const participant = {
  id: "participant-test",
  user_id: "owner-test",
  nome: "Pessoa de teste",
  categoria: "Convidado",
  cargo: "Convidado",
  instagram: "",
  whatsapp: "",
  foto: "",
  ativo: true,
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});

afterEach(cleanup);

function configureDatabase(updateError: { message: string } | null = null) {
  const updateQuery = {
    eq: vi.fn(function (this: unknown) { return this; }),
    select: vi.fn().mockResolvedValue({
      data: updateError ? null : [{ id: participant.id, user_id: participant.user_id }],
      error: updateError,
    }),
  };
  mocks.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: [participant], error: null }),
    }),
    update: vi.fn().mockReturnValue(updateQuery),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: updateError ? null : [{ id: "new-participant", user_id: participant.user_id }],
        error: updateError,
      }),
    }),
  });
  return updateQuery;
}

describe("participant form interaction", () => {
  it("scrolls to the populated form and notifies success after a confirmed save", async () => {
    configureDatabase();
    render(<ApresentadorForm />);
    const row = (await screen.findByText("Pessoa de teste")).closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByTitle("Editar"));

    expect(screen.getByPlaceholderText("Nome completo")).toHaveValue("Pessoa de teste");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    fireEvent.click(screen.getByRole("button", { name: /atualizar dados/i }));

    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Salvei"));
    expect(screen.queryByText("Salvo com sucesso!")).toBeNull();
  });

  it("does not announce success when the save fails", async () => {
    configureDatabase({ message: "Falha de teste" });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ApresentadorForm />);
    const row = (await screen.findByText("Pessoa de teste")).closest("tr");
    fireEvent.click(within(row!).getByTitle("Editar"));
    fireEvent.click(screen.getByRole("button", { name: /atualizar dados/i }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("Falha de teste")));
    expect(mocks.success).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("uses the same notification when creating a participant", async () => {
    configureDatabase();
    render(<ApresentadorForm />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "Convidado" } });
    fireEvent.change(screen.getByPlaceholderText("Nome completo"), { target: { value: "Novo participante" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar participante/i }));

    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Salvei"));
    expect(screen.queryByText("Salvo com sucesso!")).toBeNull();
  });
});
