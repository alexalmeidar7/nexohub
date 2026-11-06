import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

vi.mock("@/services/logoTransformService", () => ({
  uploadToPngDataUrl: vi.fn().mockResolvedValue("data:image/png;base64,b3JpZ2luYWw="),
  transformLogoWithBackend: vi.fn().mockResolvedValue({ success: false, error: "Serviço indisponível" }),
  vectorizeWhiteLogo1080: vi.fn().mockResolvedValue("data:image/png;base64,YWp1c3RhZGE="),
  dataUrlToFile: vi.fn(() => new File(["ajustada"], "logo.png", { type: "image/png" })),
}));

import { LogoTransformModal } from "@/components/LogoTransformModal";

afterEach(cleanup);

describe("LogoTransformModal", () => {
  it("requires approval before saving the local fallback even with automatic saving enabled", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    render(
      <LogoTransformModal
        isOpen
        onClose={close}
        initialFile={new File(["original"], "logo.png", { type: "image/png" })}
        programas={[]}
        preselectedProgramIds={["programa"]}
        autoSave
        onApproveAndSave={save}
      />,
    );

    await screen.findByText(/confira a prévia antes de salvar/i);
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /aprovar/i }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(close).toHaveBeenCalledOnce();
  });
});
