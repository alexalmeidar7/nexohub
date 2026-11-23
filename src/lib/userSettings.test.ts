import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(),
  update: vi.fn(), limit: vi.fn(), upsert: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mock.from },
}));
import { mergeUserDashboardItems } from "./userSettings";
beforeEach(() => {
  for (const fn of Object.values(mock)) fn.mockReset();
  const query = {
    select: mock.select, eq: mock.eq, maybeSingle: mock.maybeSingle,
    update: mock.update, limit: mock.limit, upsert: mock.upsert,
  };
  mock.from.mockReturnValue(query);
  mock.select.mockReturnValue(query);
  mock.eq.mockReturnValue(query);
  mock.update.mockReturnValue(query);
  mock.limit.mockResolvedValue({ data: [{ user_id: "station-1" }], error: null });
});
describe("dashboard items: read once, write only when something changed", () => {
  it("does not issue PATCH or update updated_at for an identical patch", async () => {
    mock.maybeSingle.mockResolvedValue({
      data: { dashboard_items: { music: { title: "Same" }, other: "keep" },
        updated_at: "2026-11-23T10:00:00Z" }, error: null,
    });
    await mergeUserDashboardItems("station-1", { music: { title: "Same" } });
    expect(mock.from).toHaveBeenCalledWith("user_settings");
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.upsert).not.toHaveBeenCalled();
  });
  it("preserves sibling JSON fields when there is a real change", async () => {
    mock.maybeSingle.mockResolvedValue({
      data: { dashboard_items: { music: { title: "Old", cover: "Keep" }, other: "keep" },
        updated_at: "2026-11-23T10:00:00Z" }, error: null,
    });
    await mergeUserDashboardItems("station-1", { music: { title: "New" } });
    expect(mock.update).toHaveBeenCalledTimes(1);
    expect(mock.update.mock.calls[0][0].dashboard_items)
      .toEqual({ music: { title: "New", cover: "Keep" }, other: "keep" });
    expect(mock.upsert).not.toHaveBeenCalled();
  });
});
