import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioPreview from "./StudioPreview";

vi.mock("@/lib/vmixRemoteRooms", () => ({ acquireVmixRoom: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

beforeEach(() => {
  window.houseMixDesktop = { isDesktop: true } as any;
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: true, sources: [] }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete window.houseMixDesktop; localStorage.clear(); });

describe("studio and remote preview interfaces", () => {
  it("remote operators receive media without mounting local NDI discovery or source selectors", () => {
    render(<StudioPreview connectionId={null} remote inputs={[]} baseUrl="http://192.168.1.2:8088" />);
    expect(screen.getByRole("complementary", { name: "Retorno remoto de vídeo e áudio" })).toBeInTheDocument();
    expect(screen.getByLabelText("Qualidade do vídeo remoto")).toBeInTheDocument();
    expect(screen.queryByLabelText("Fonte NDI disponível na rede")).not.toBeInTheDocument();
    expect(screen.queryByText("Áudio da mesa · fonte NDI")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Habilitar envio" })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("the studio gear hides both source selectors while keeping the video and send button mounted", async () => {
    localStorage.setItem("housemix:ndi-preview-network-source:v1", "Video da radio");
    await act(async () => { render(<StudioPreview connectionId={null} remote={false} inputs={[]} baseUrl="http://127.0.0.1:8088" />); });
    const video = screen.getByAltText("Preview NDI: Video da radio");
    expect(screen.getByLabelText("Fonte NDI disponível na rede")).toBeInTheDocument();
    expect(screen.getByLabelText("Áudio da mesa · fonte NDI")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Configurar fontes do preview" }));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Habilitar envio" })).toBeInTheDocument();
    expect(screen.getByAltText("Preview NDI: Video da radio")).toBe(video);
    fireEvent.click(screen.getByRole("button", { name: "Configurar fontes do preview" }));
    expect(screen.getByLabelText("Fonte NDI disponível na rede")).toHaveValue("Video da radio");
    expect(screen.getByLabelText("Áudio da mesa · fonte NDI")).toBeInTheDocument();
  });
});
