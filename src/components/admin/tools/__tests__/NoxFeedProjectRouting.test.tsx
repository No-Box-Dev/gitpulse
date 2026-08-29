import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn(async () => ({ ok: true }));

vi.mock("@/hooks/useNoxFeedRouting", () => ({
  useNoxFeedRoutes: () => ({
    data: {
      projects: [{
        id: "proj-playnist",
        name: "Playnist",
        archived: false,
        repositories: ["web"],
        posts: { connectionId: "conn-1", channelId: "C-POSTS" },
        releaseNotes: { connectionId: "conn-1", channelId: "C-RELEASES" },
      }],
      repositories: ["api", "web"],
    },
    isLoading: false,
    isError: false,
  }),
  useSaveNoxFeedProjectRoute: () => ({ mutateAsync, isPending: false, isError: false }),
}));

vi.mock("@/components/admin/slack/useSlackChannels", () => ({
  useSlackChannels: () => ({
    status: { data: { connections: [{ id: "conn-1", teamName: "Playnist" }] } },
    channels: { isLoading: false, isError: false },
    channelOptions: [
      { value: "", label: "— No channel —" },
      { value: "C-POSTS", label: "#posts" },
      { value: "C-RELEASES", label: "#release-notes" },
    ],
  }),
}));

vi.mock("@/lib/api", () => ({ apiPost: vi.fn() }));

import { NoxFeedProjectRouting } from "../NoxFeedProjectRouting";

describe("NoxFeedProjectRouting", () => {
  beforeEach(() => mutateAsync.mockClear());

  it("assigns several repositories to one project", async () => {
    render(<NoxFeedProjectRouting />);
    expect(screen.getByRole("checkbox", { name: /web/ })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /api/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save project" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      projectId: "proj-playnist",
      route: {
        repositories: ["web", "api"],
        posts: { connectionId: "conn-1", channelId: "C-POSTS" },
        releaseNotes: { connectionId: "conn-1", channelId: "C-RELEASES" },
      },
    }));
  });
});
