import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import {
  findParticipantRowForEdit,
  mergeApresentadorSources,
  removeParticipantFromSource,
  type Apresentador,
} from "@/components/ApresentadorForm";

const OWNER_ID = "452ebd1e-61a0-42dd-bf80-231a3f426c83";

function configureSupabase(deletedRows: Record<string, unknown>[], error: { message: string } | null = null) {
  const deleteEq = vi.fn(function (this: unknown) { return this; });
  const deleteSelect = vi.fn().mockResolvedValue({ data: deletedRows, error });
  const deleteQuery = { eq: deleteEq, select: deleteSelect };
  const deleteRows = vi.fn().mockReturnValue(deleteQuery);
  mocks.from.mockReturnValue({ delete: deleteRows });
  return { deleteEq, deleteRows };
}

function makeParticipant(id: string, persisted: boolean): Apresentador {
  return {
    id,
    nome: "Participante de teste",
    cargo: "Convidado",
    categoria: "Convidado",
    instagram: "",
    whatsapp: "",
    foto: "",
    ativo: true,
    persisted,
  };
}

describe("mergeApresentadorSources", () => {
  it("uses the persisted photo instead of a stale local cache photo", () => {
    const id = "40e402a2-ecec-42d7-9e45-22b62b78880d";
    const defaults = [{ ...makeParticipant(id, false), foto: "/catalogo/foto-antiga.png" }];
    const local = [{ ...makeParticipant(id, true), foto: "/cache/foto-antiga.png" }];
    const persisted = [{ ...makeParticipant(id, true), foto: "https://cdn.example/foto-atual.webp" }];

    expect(mergeApresentadorSources(defaults, local, persisted)).toEqual([
      { ...makeParticipant(id, true), foto: "https://cdn.example/foto-atual.webp" },
    ]);
  });
});

describe("removeParticipantFromSource", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.from.mockReset();
  });

  it("tombstones a local UUID without issuing a database DELETE", async () => {
    const id = "8e89153c-6440-42c0-965e-bd94f5df5a51";
    const result = await removeParticipantFromSource(makeParticipant(id, false), OWNER_ID);

    expect(result).toEqual({});
    expect(mocks.from).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(`nexohub_participantes_excluidos_${OWNER_ID}`) || "[]")).toContain(id);
  });

  it("keeps local state unchanged unless the database confirms both id and owner", async () => {
    const id = "63d0a938-7bb0-4bfc-a0df-92d36bfa3ec8";
    const { deleteRows, deleteEq } = configureSupabase([{ id, user_id: "another-station-id" }]);
    const result = await removeParticipantFromSource(makeParticipant(id, true), OWNER_ID);

    expect(deleteRows).toHaveBeenCalledOnce();
    expect(deleteEq).toHaveBeenNthCalledWith(1, "id", id);
    expect(deleteEq).toHaveBeenNthCalledWith(2, "user_id", OWNER_ID);
    expect(result.error).toMatch(/não confirmou/i);
    expect(localStorage.getItem(`nexohub_participantes_excluidos_${OWNER_ID}`)).toBeNull();
  });

  it("accepts deletion only when the returned id and owner match", async () => {
    const id = "bf61a8ea-866c-49dd-a3e2-00f1de0aefcc";
    const { deleteRows } = configureSupabase([{ id, user_id: OWNER_ID }]);
    const result = await removeParticipantFromSource(makeParticipant(id, true), OWNER_ID);

    expect(deleteRows).toHaveBeenCalledOnce();
    expect(result).toEqual({});
  });
});

describe("findParticipantRowForEdit", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("finds the existing row by id before considering an insert", async () => {
    const id = "b00e67fb-d11d-4c65-a75b-0f4502a316a2";
    const byId = {
      eq: vi.fn(function (this: unknown) { return this; }),
      limit: vi.fn().mockResolvedValue({ data: [{ id, user_id: OWNER_ID }], error: null }),
    };
    const select = vi.fn().mockReturnValue(byId);
    mocks.from.mockReturnValue({ select });

    await expect(findParticipantRowForEdit(makeParticipant(id, false), OWNER_ID)).resolves.toBe(id);
    expect(select).toHaveBeenCalledOnce();
    expect(byId.eq).toHaveBeenNthCalledWith(1, "id", id);
    expect(byId.eq).toHaveBeenNthCalledWith(2, "user_id", OWNER_ID);
  });

  it("matches an existing local-catalog participant by unique name when its ID differs", async () => {
    const participantId = "local-catalog-id";
    const existingId = "2bcd099c-78f5-4a80-ad34-687cf6cd9ae3";
    const byId = {
      eq: vi.fn(function (this: unknown) { return this; }),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const byName = {
      eq: vi.fn(function (this: unknown) { return this; }),
      limit: vi.fn().mockResolvedValue({
        data: [{ id: existingId, user_id: OWNER_ID }],
        error: null,
      }),
    };
    const select = vi.fn()
      .mockReturnValueOnce(byId)
      .mockReturnValueOnce(byName);
    mocks.from.mockReturnValue({ select });

    await expect(findParticipantRowForEdit(makeParticipant(participantId, false), OWNER_ID)).resolves.toBe(existingId);
    expect(byName.eq).toHaveBeenNthCalledWith(1, "user_id", OWNER_ID);
    expect(byName.eq).toHaveBeenNthCalledWith(2, "nome", "Participante de teste");
  });
});
