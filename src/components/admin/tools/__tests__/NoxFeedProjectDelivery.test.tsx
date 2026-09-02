import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn(async () => ({ ok: true }));

vi.mock("@/hooks/useProjectRouting", () => ({
  useProjectRouting: () => ({
    data: {
      projects: [
        {
          id: "project-a",
          name: "Project A",
          archived: false,
          enabled: true,
          repositories: ["api"],
          routes: {
            noxfeedPosts: { connectionId: "connection-a", channelId: "C-A" },
            noxfeedReleaseNotes: { connectionId: "connection-a", channelId: "C-A" },
            noxCue: { connectionId: "", channelId: "" },
            noxCueAlerts: { connectionId: "", channelId: "" },
          },
        },
        {
          id: "project-b",
          name: "Project B",
          archived: false,
          enabled: true,
          repositories: ["web", "worker"],
          routes: {
            noxfeedPosts: { connectionId: "", channelId: "" },
            noxfeedReleaseNotes: { connectionId: "", channelId: "" },
            noxCue: { connectionId: "connection-b", channelId: "C-CUE" },
            noxCueAlerts: { connectionId: "", channelId: "" },
          },
        },
        {
          id: "project-disabled",
          name: "Disabled project",
          archived: false,
          enabled: false,
          repositories: [],
          routes: {
            noxfeedPosts: { connectionId: "", channelId: "" },
            noxfeedReleaseNotes: { connectionId: "", channelId: "" },
            noxCue: { connectionId: "", channelId: "" },
            noxCueAlerts: { connectionId: "", channelId: "" },
          },
        },
      ],
      repositories: ["api", "web", "worker"],
    },
    isLoading: false,
    isError: false,
  }),
  useSaveProjectRouting: () => ({ mutateAsync, isPending: false, isError: false }),
}));

vi.mock("@/components/admin/slack/ProjectSlackRouteField", () => ({
  ProjectSlackRouteField: ({ projectId, onChange }: {
    projectId: string;
    onChange: (value: { connectionId: string; channelId: string }) => void;
  }) => <button type="button" onClick={() => onChange({ connectionId: `connection-${projectId}`, channelId: "C-FEED" })}>Choose project channel</button>,
}));

import { NoxFeedProjectDelivery } from "../NoxFeedProjectDelivery";

describe("NoxFeedProjectDelivery", () => {
  beforeEach(() => mutateAsync.mockClear());

  it("offers enabled NoxConnect projects and saves one release-note channel", async () => {
    render(<NoxFeedProjectDelivery />);

    const project = screen.getByRole("combobox", { name: "NoxFeed project" });
    expect(screen.getByRole("option", { name: "Project A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Project B" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Disabled project" })).not.toBeInTheDocument();

    fireEvent.change(project, { target: { value: "project-b" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose project channel" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      projectId: "project-b",
      routing: {
        enabled: true,
        repositories: ["web", "worker"],
        routes: {
          noxfeedPosts: { connectionId: "connection-project-b", channelId: "C-FEED" },
          noxfeedReleaseNotes: { connectionId: "connection-project-b", channelId: "C-FEED" },
          noxCue: { connectionId: "connection-b", channelId: "C-CUE" },
          noxCueAlerts: { connectionId: "", channelId: "" },
        },
      },
    }));
  });
});
