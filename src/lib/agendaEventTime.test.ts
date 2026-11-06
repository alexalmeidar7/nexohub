import { describe, expect, it } from "vitest";
import { isAgendaEventNow, isAgendaEventPast } from "./agendaEventTime";

describe("agenda event timing", () => {
  const at = (day: number, hour: number, minute: number) => new Date(2026, 10, day, hour, minute);

  it("only marks a timed event during its scheduled minutes", () => {
    expect(isAgendaEventNow("2026-11-06", "08:00", "09:59", at(6, 7, 59))).toBe(false);
    expect(isAgendaEventNow("2026-11-06", "08:00:00", "09:59:00", at(6, 8, 0))).toBe(true);
    expect(isAgendaEventNow("2026-11-06", "08:00", "09:59", at(6, 9, 58))).toBe(true);
    expect(isAgendaEventNow("2026-11-06", "08:00", "09:59", at(6, 9, 59))).toBe(false);
    expect(isAgendaEventPast("2026-11-06", "08:00", "09:59", at(6, 9, 59))).toBe(true);
    expect(isAgendaEventNow("2026-11-06", "08:00", "09:59", at(6, 10, 0))).toBe(false);
    expect(isAgendaEventPast("2026-11-06", "08:00", "09:59", at(6, 10, 0))).toBe(true);
    expect(isAgendaEventNow("2026-11-07", "08:00", "09:59", at(6, 8, 30))).toBe(false);
  });

  it("handles overnight events before and after midnight", () => {
    expect(isAgendaEventNow("2026-11-06", "23:00", "01:00", at(6, 22, 59))).toBe(false);
    expect(isAgendaEventPast("2026-11-06", "23:00", "01:00", at(6, 22, 59))).toBe(false);
    expect(isAgendaEventNow("2026-11-06", "23:00", "01:00", at(6, 23, 0))).toBe(true);
    expect(isAgendaEventNow("2026-11-06", "23:00", "01:00", at(7, 0, 59))).toBe(true);
    expect(isAgendaEventNow("2026-11-06", "23:00", "01:00", at(7, 1, 0))).toBe(false);
    expect(isAgendaEventPast("2026-11-06", "23:00", "01:00", at(7, 1, 0))).toBe(true);
    expect(isAgendaEventPast("2026-11-06", "23:00", "01:00", at(7, 1, 1))).toBe(true);
  });

  it("handles all-day events and avoids guessing incomplete or invalid times", () => {
    expect(isAgendaEventNow("2026-11-06", "", "", at(6, 12, 0))).toBe(true);
    expect(isAgendaEventNow("2026-11-07", "", "", at(6, 12, 0))).toBe(false);
    expect(isAgendaEventNow("2026-11-06", "08:00", "", at(6, 12, 0))).toBe(false);
    expect(isAgendaEventNow("2026-11-06", "25:00", "26:00", at(6, 12, 0))).toBe(false);
  });
});
