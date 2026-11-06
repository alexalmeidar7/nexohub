import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import XmlXPathDialog from "@/components/XmlXPathDialog";
import type { InteractiveXmlFeed } from "@/lib/interactiveXmlSchema";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("XmlXPathDialog interactive feeds", () => {
  it.each([
    ["batalha", "/items/batalha/artista1_nome"],
    ["enquete", "/items/enquete/pergunta"],
    ["quiz", "/items/dados/pergunta"],
  ] as const)("shows %s reference paths while reporting a 503", async (feed, xpath) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    render(<XmlXPathDialog open onOpenChange={() => {}} title={feed} url="/feed.xml" interactiveFeed={feed} />);

    expect(await screen.findByText(xpath)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("HTTP 503");
    expect(screen.getAllByText("(indisponível)").length).toBeGreaterThan(0);
    expect(screen.queryByText("(vazio)")).toBeNull();
  });

  it.each([
    ["batalha", "batalha", "artista1_nome"],
    ["enquete", "enquete", "pergunta"],
    ["quiz", "dados", "pergunta"],
  ] as [InteractiveXmlFeed, string, string][])("shows successful %s feed values, including empty fields", async (feed, root, field) => {
    const xml = `<items><${root}><${field}></${field}><horario_inicio>10:00</horario_inicio></${root}></items>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => xml }));
    render(<XmlXPathDialog open onOpenChange={() => {}} title={feed} url="/feed.xml" interactiveFeed={feed} />);

    expect(await screen.findByText(`/items/${root}/${field}`)).toBeTruthy();
    expect(screen.getByText("(vazio)")).toBeTruthy();
    expect(screen.getByText("10:00")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not substitute a reference schema for unrelated feeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    render(<XmlXPathDialog open onOpenChange={() => {}} title="Outro" url="/feed.xml" />);

    expect(await screen.findByText(/HTTP 503/)).toBeTruthy();
    expect(screen.queryByText(/\/items\/dados\/pergunta/)).toBeNull();
  });
});
