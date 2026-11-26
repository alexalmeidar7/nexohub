import { describe, expect, it } from "vitest";
import { isRadioId, radioChatChannelId } from "./playerRadioChatScope";

describe("isolamento do chat por rádio", () => {
  it("não oferece conversa compartilhada sem rádio válida", () => {
    expect(radioChatChannelId(null)).toBeNull();
    expect(radioChatChannelId("default")).toBeNull();
    expect(radioChatChannelId("interativafm")).toBeNull();
    expect(isRadioId("default")).toBe(false);
  });
  it("separa mensagens de rádios diferentes", () => {
    const positiva = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const interativa = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(radioChatChannelId(positiva)).not.toBe(radioChatChannelId(interativa));
    expect(radioChatChannelId(positiva)).toBe(`radio-${positiva}`);
  });
});
