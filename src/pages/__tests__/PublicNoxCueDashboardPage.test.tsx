import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PublicNoxCueDashboardPage } from "../PublicNoxCueDashboardPage";

describe("public NoxCue dashboard sections", () => {
  afterEach(() => vi.restoreAllMocks());

  it("separates stats from alerts and expands retained error occurrences", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      project: { name: "Playnist" }, generatedAt: "2026-09-04T10:00:00Z",
      sources: [{
        id: "source-1", name: "playnist-web", environment: "production", period: "2026-09-03",
        settings: { collecting: true, digestEnabled: true, alertsEnabled: true, timezone: "UTC", digestTimeLocal: "00:00" },
        endpoint: { enabled: false, url: null, status: "waiting", lastCheckedAt: null, statusCode: null, latencyMs: null, error: null },
        metrics: {}, comparisons: {}, metricLabels: {}, features: [],
        errors: [{
          title: "ResizeObserver loop completed", errorCode: "RESIZE_LOOP", component: "playnist-web",
          firstSeenAt: "2026-09-03T09:00:00Z", lastSeenAt: "2026-09-03T10:00:00Z", occurrenceCount: 2,
          occurrences: [{
            id: "event-2", message: "ResizeObserver loop completed with undelivered notifications.",
            occurredAt: "2026-09-03T10:00:00Z", receivedAt: "2026-09-03T10:00:01Z",
            url: "https://app.playnist.com/signup", errorCode: "RESIZE_LOOP", component: "playnist-web",
            environment: "production", fatal: false, unhandled: true,
          }],
        }],
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    render(<MemoryRouter initialEntries={["/cue/dashboard-token"]}>
      <Routes><Route path="/cue/:slug" element={<PublicNoxCueDashboardPage />} /></Routes>
    </MemoryRouter>);

    const statsTab = await screen.findByRole("tab", { name: "Stats" });
    const alertsTab = screen.getByRole("tab", { name: "Alerts" });
    expect(statsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Stats");
    expect(screen.queryByText("ResizeObserver loop completed")).not.toBeInTheDocument();

    fireEvent.click(alertsTab);
    expect(alertsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Alerts");

    const group = screen.getByRole("button", { name: /ResizeObserver loop completed/ });
    expect(group).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(group);

    expect(group).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("ResizeObserver loop completed with undelivered notifications.")).toBeInTheDocument();
    expect(screen.getByText("Unhandled")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://app.playnist.com/signup" })).toHaveAttribute("href", "https://app.playnist.com/signup");
    expect(screen.getByText("Showing the latest 1 retained occurrence of 2 total.")).toBeInTheDocument();
  });
});
