import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.fn();
const load = vi.fn((projectId: string | null) => ({
  data: projectId ? {
    project: { id: projectId, name: projectId === "playnist" ? "Playnist" : "NoxConnect" },
    sourceCount: 1,
    enabledSourceCount: 1,
    metrics: [
      {
        key: "users.new",
        label: "New users",
        unit: "count",
        description: "Registered during the completed day.",
        enabled: true,
        active: true,
        lastEventAt: "2026-08-29T10:00:00Z",
      },
      {
        key: "users.active.daily",
        label: "Daily active users",
        unit: "count",
        description: "Unique active users during the day.",
        enabled: false,
        active: false,
        lastEventAt: null,
      },
    ],
  } : undefined,
  isLoading: false,
  isError: false,
}));

vi.mock("@/hooks/useNoxCue", () => ({
  useNoxCueProjectMetrics: (projectId: string | null) => load(projectId),
  useSaveNoxCueProjectMetrics: () => ({ mutate: save, isPending: false, isError: false }),
}));

import { ProjectMetricControls } from "../NoxCueSourcesSection";

describe("NoxCue project metric controls", () => {
  beforeEach(() => {
    load.mockClear();
    save.mockClear();
  });

  it("shows metric readiness and saves selection for the chosen project", () => {
    render(<ProjectMetricControls
      projects={[{ id: "playnist", name: "Playnist" }, { id: "noxconnect", name: "NoxConnect" }]}
      initialProjectId="playnist"
    />);

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Daily active users/ }));
    expect(save).toHaveBeenCalledWith(["users.new", "users.active.daily"]);

    fireEvent.change(screen.getByRole("combobox", { name: "Project" }), { target: { value: "noxconnect" } });
    expect(load).toHaveBeenLastCalledWith("noxconnect");
  });
});
