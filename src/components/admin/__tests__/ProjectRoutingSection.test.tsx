import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn(async () => ({ ok: true }));

vi.mock("@/hooks/useProjectRouting", () => ({
  useProjectRouting: () => ({
    data: {
      projects: [{
        id: "proj-playnist",
        name: "Playnist",
        archived: false,
        enabled: true,
        repositories: ["web"],
        routes: {
          noxfeedPosts: { connectionId: "conn-1", channelId: "C-POSTS" },
          noxfeedReleaseNotes: { connectionId: "conn-1", channelId: "C-RELEASES" },
          noxCue: { connectionId: "", channelId: "" },
        },
      }],
      repositories: ["api", "web"],
    },
    isLoading: false,
    isError: false,
  }),
  useSaveProjectRouting: () => ({ mutateAsync, isPending: false, isError: false }),
}));

vi.mock("@/components/admin/slack/useSlackChannels", () => ({
  useSlackChannels: () => ({
    status: { data: { connections: [{ id: "conn-1", teamName: "Playnist", projectId: "proj-playnist" }] } },
    channels: { isLoading: false, isError: false },
    channelOptions: [
      { value: "", label: "— No channel —" },
      { value: "C-POSTS", label: "#posts" },
      { value: "C-RELEASES", label: "#release-notes" },
    ],
  }),
}));

vi.mock("@/lib/api", () => ({ apiPost: vi.fn() }));

import { ProjectRoutingSection } from "../ProjectRoutingSection";

describe("ProjectRoutingSection", () => {
  beforeEach(() => mutateAsync.mockClear());

  it("assigns several repositories and all product routes to one core project", async () => {
    render(<ProjectRoutingSection />);
    expect(screen.getByRole("checkbox", { name: /web/ })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /api/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save project" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      projectId: "proj-playnist",
      routing: {
        enabled: true,
        repositories: ["web", "api"],
        routes: {
          noxfeedPosts: { connectionId: "conn-1", channelId: "C-POSTS" },
          noxfeedReleaseNotes: { connectionId: "conn-1", channelId: "C-RELEASES" },
          noxCue: { connectionId: "", channelId: "" },
        },
      },
    }));
  });

  it("lets an admin explicitly disable a repository-shaped project", async () => {
    render(<ProjectRoutingSection />);
    fireEvent.click(screen.getByRole("switch", { name: "Enable Playnist as a NoxConnect project" }));
    expect(screen.getByText("Not used as a routing project")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /api/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save project" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "proj-playnist",
      routing: expect.objectContaining({ enabled: false }),
    })));
  });
});
