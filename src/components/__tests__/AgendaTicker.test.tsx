import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AgendaTicker from "../AgendaTicker";

afterEach(cleanup);

describe("AgendaTicker", () => {
  it("shows a green fixed badge with only its text animated for an active event", () => {
    render(<AgendaTicker text="Evento no ar" isNow />);
    const label = screen.getAllByText("AGORA").find((element) => !element.closest('[aria-hidden="true"]'));
    expect(label).toBeTruthy();
    expect(label?.className).toContain("motion-safe:animate-pulse");
    expect(label?.parentElement?.className).toContain("bg-green-700");
    expect(label?.parentElement?.className).not.toContain("animate");
    expect(screen.getAllByText("Evento no ar")).toHaveLength(2);
  });

  it("keeps the normal date and time for an upcoming event", () => {
    render(<AgendaTicker text="Hoje · 06/11 · 12:00–12:59 · Evento" />);
    expect(screen.getAllByText("Hoje · 06/11 · 12:00–12:59 · Evento")).toHaveLength(2);
    expect(screen.queryByText("AGORA")).toBeNull();
  });
});
