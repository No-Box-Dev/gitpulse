import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/slack/useSlackChannels", () => ({
  useSlackChannels: () => ({
    status: { data: { connections: [{ id: "connection-1", teamName: "Acme", projectId: null }] } },
    channels: { isLoading: false },
    channelOptions: [
      { value: "", label: "— No channel —" },
      { value: "C-FEED", label: "#feed" },
    ],
  }),
}));

vi.mock("@/lib/api", () => ({ apiPost: vi.fn() }));

import { ProjectSlackRouteField } from "../ProjectSlackRouteField";

describe("ProjectSlackRouteField", () => {
  it("does not offer channels until a workspace is selected", () => {
    render(<ProjectSlackRouteField
      projectId="project-1"
      label="Project channel"
      kind="noxfeed_posts"
      value={{ connectionId: "", channelId: "" }}
      onChange={vi.fn()}
    />);

    const selects = screen.getAllByRole("button");
    fireEvent.click(selects[2]);
    expect(screen.queryByText("#feed")).not.toBeInTheDocument();
    expect(screen.getAllByText("Use organization default").length).toBeGreaterThan(0);
  });
});
