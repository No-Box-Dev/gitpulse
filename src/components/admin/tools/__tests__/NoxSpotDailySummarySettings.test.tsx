import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NoxSpotSite } from "@/lib/types";

const mutate = vi.fn();
vi.mock("@/hooks/useNoxSpot", () => ({
  useUpdateNoxSpotSite: () => ({ mutate, isPending: false, isSuccess: false, isError: false }),
  useCreateNoxSpotSite: vi.fn(),
  useDeleteNoxSpotSite: vi.fn(),
  useNoxSpotSites: vi.fn(),
  useRetryNoxSpotDeliveries: vi.fn(),
  useTestNoxSpotSlack: vi.fn(),
  useUpsertNoxSpotExternalShare: vi.fn(),
  useDeleteNoxSpotExternalShare: vi.fn(),
}));

import { NoxSpotDailySummarySettings } from "../NoxSpotSiteManagement";

const site = {
  id: "site-1",
  name: "Playnist",
  dailySummaryEnabled: true,
  dailySummaryTime: "09:00",
  dailySummaryTimezone: "UTC",
} as NoxSpotSite;

describe("NoxSpot daily summary settings", () => {
  beforeEach(() => mutate.mockReset());

  it("saves the selected local time and timezone", async () => {
    const user = userEvent.setup();
    render(<NoxSpotDailySummarySettings site={site} />);

    await user.clear(screen.getByLabelText("Daily summary time for Playnist"));
    await user.type(screen.getByLabelText("Daily summary time for Playnist"), "14:30");
    await user.clear(screen.getByLabelText("Daily summary timezone for Playnist"));
    await user.type(screen.getByLabelText("Daily summary timezone for Playnist"), "Asia/Kuala_Lumpur");
    await user.click(screen.getByRole("button", { name: "Save summary" }));

    expect(mutate).toHaveBeenCalledWith({
      id: "site-1",
      dailySummaryEnabled: true,
      dailySummaryTime: "14:30",
      dailySummaryTimezone: "Asia/Kuala_Lumpur",
    });
  });

  it("can turn the daily post off", async () => {
    const user = userEvent.setup();
    render(<NoxSpotDailySummarySettings site={site} />);
    await user.click(screen.getByRole("checkbox", { name: "Enabled" }));
    await user.click(screen.getByRole("button", { name: "Save summary" }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ dailySummaryEnabled: false }));
  });
});
