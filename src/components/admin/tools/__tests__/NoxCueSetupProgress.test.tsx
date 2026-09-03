import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NoxCueSource } from "@/lib/noxcue-api";

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(async () => ({ ok: true })),
  channelStatuses: [] as Array<Record<string, unknown>>,
  refetchStatus: vi.fn(async () => undefined),
}));

vi.mock("@/components/admin/slack/useSlackChannels", () => ({
  useSlackChannels: () => ({
    status: {
      data: { connected: true, canConfigure: true, channelStatuses: mocks.channelStatuses },
      refetch: mocks.refetchStatus,
    },
    channels: { data: [{ id: "C123", name: "app-stats" }] },
    channelOptions: [],
  }),
}));

vi.mock("@/hooks/useNoxCue", () => ({}));
vi.mock("@/lib/api", () => ({ apiPost: mocks.apiPost }));

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
  allowedOrigins: [],
  healthEnabled: false,
  healthUrl: null,
  healthStatus: "waiting",
  healthLastCheckedAt: null,
  healthLastError: null,
  healthLastStatusCode: null,
  healthLastLatencyMs: null,
  effectiveAlertSlackChannelId: "C123",
  effectiveAlertSlackConnectionId: "connection-1",
  alertSlackRouteLevel: "project",
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
  beforeEach(() => {
    mocks.apiPost.mockClear();
    mocks.refetchStatus.mockClear();
    mocks.channelStatuses = [];
  });

  it("shows the next action while waiting for a real event", () => {
    const onCheck = vi.fn();
    render(<SetupProgress
      source={source}
      slackConnected
      checking={false}
      checkedWithoutEvent
      onCheck={onCheck}
    />);

    expect(screen.getByText("3 of 5 complete")).toBeInTheDocument();
    expect(screen.getByText("#app-stats · project route")).toBeInTheDocument();
    expect(screen.getByText("Verify Slack delivery")).toBeInTheDocument();
    expect(screen.getByText(/No user event yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check for event" }));
    expect(onCheck).toHaveBeenCalledOnce();
  });

  it("confirms storage and the first daily-pulse timing", () => {
    mocks.channelStatuses = [{
      connectionId: "conn-1",
      channelId: "C123",
      status: "verified",
      verifiedAt: "2026-08-30T01:30:00Z",
      lastAttemptedAt: "2026-08-30T01:30:00Z",
      lastDeliveredAt: "2026-08-30T01:30:00Z",
      lastError: null,
    }];
    render(<SetupProgress
      source={{ ...source, lastRegistrationAt: "2026-08-30T01:00:00Z", lastActivityAt: "2026-08-30T01:00:00Z" }}
      slackConnected
      checking={false}
      checkedWithoutEvent={false}
      onCheck={() => undefined}
    />);

    expect(screen.getByText("5 of 5 complete")).toBeInTheDocument();
    expect(screen.getByText("Slack delivery healthy")).toBeInTheDocument();
    expect(screen.getByText("NoxCue is live")).toBeInTheDocument();
    expect(screen.getByText(/after 03:30 UTC/)).toBeInTheDocument();
  });

  it("posts a real test and surfaces a persisted delivery issue", async () => {
    mocks.channelStatuses = [{
      connectionId: "conn-1",
      channelId: "C123",
      status: "issue",
      verifiedAt: null,
      lastAttemptedAt: "2026-08-30T01:30:00Z",
      lastDeliveredAt: null,
      lastError: "not_in_channel",
    }];
    render(<SetupProgress
      source={source}
      slackConnected
      checking={false}
      checkedWithoutEvent={false}
      onCheck={() => undefined}
    />);

    expect(screen.getByText("Slack delivery issue")).toBeInTheDocument();
    expect(screen.getAllByText(/not_in_channel/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Retry test" }));
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith("/api/slack/test", {
      kind: "noxcue",
      connectionId: "conn-1",
      channelId: "C123",
    }));
  });
});
