import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NoxCueSource } from "@/lib/noxcue-api";

vi.mock("@/components/admin/slack/useSlackChannels", () => ({
  useSlackChannels: () => ({
    status: { data: { connected: true, canConfigure: true } },
    channels: { data: [{ id: "C123", name: "app-stats" }] },
    channelOptions: [],
  }),
}));

vi.mock("@/hooks/useNoxCue", () => ({}));

import { SetupProgress } from "../NoxCueSourcesSection";

const source: NoxCueSource = {
  id: "source-1",
  name: "Playnist",
  enabled: true,
  projectId: "playnist",
  projectName: "Playnist",
  timezone: "UTC",
  digestEnabled: true,
  digestTimeLocal: "03:30",
  slackChannelId: null,
  slackConnectionId: null,
  effectiveSlackChannelId: "C123",
  effectiveSlackConnectionId: "conn-1",
  slackRouteLevel: "project",
  lastRegistrationAt: null,
  lastActivityAt: null,
  createdAt: "2026-08-29T00:00:00Z",
  keys: [{
    id: "key-1", name: "Server", kind: "secret", prefix: "nox_secret_abc",
    createdAt: "2026-08-29T00:00:00Z", lastUsedAt: null, revokedAt: null,
  }],
};

describe("NoxCue setup progress", () => {
  it("shows the next action while waiting for a real event", () => {
    const onCheck = vi.fn();
    render(<SetupProgress
      source={source}
      slackConnected
      checking={false}
      checkedWithoutEvent
      onCheck={onCheck}
    />);

    expect(screen.getByText("3 of 4 complete")).toBeInTheDocument();
    expect(screen.getByText("#app-stats · project route")).toBeInTheDocument();
    expect(screen.getByText(/No user event yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check for event" }));
    expect(onCheck).toHaveBeenCalledOnce();
  });

  it("confirms storage and the first daily-pulse timing", () => {
    render(<SetupProgress
      source={{ ...source, lastRegistrationAt: "2026-08-30T01:00:00Z", lastActivityAt: "2026-08-30T01:00:00Z" }}
      slackConnected
      checking={false}
      checkedWithoutEvent={false}
      onCheck={() => undefined}
    />);

    expect(screen.getByText("4 of 4 complete")).toBeInTheDocument();
    expect(screen.getByText("NoxCue is live")).toBeInTheDocument();
    expect(screen.getByText(/after 03:30 UTC/)).toBeInTheDocument();
  });
});
