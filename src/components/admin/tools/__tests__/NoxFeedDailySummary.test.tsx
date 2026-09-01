import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn(async () => ({ ok: true }));
const settings = {
  slack: { releaseNotesChannelId: "C123", releaseNotesConnectionId: "connection-1" },
};

vi.mock("@/hooks/useConfigRepo", () => ({
  useSettings: () => ({ data: settings }),
  useSaveSettings: () => ({ mutateAsync, isPending: false, isError: false }),
}));

vi.mock("@/components/ui/SearchableSelect", () => ({
  SearchableSelect: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <select aria-label="Timezone" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value={value}>{value}</option>
      <option value="UTC">UTC</option>
    </select>
  ),
}));

import { NoxFeedDailySummary } from "../NoxFeedDailySummary";

describe("NoxFeed daily summary settings", () => {
  beforeEach(() => mutateAsync.mockClear());

  it("starts off and saves the user's local schedule", async () => {
    const user = userEvent.setup();
    render(<NoxFeedDailySummary />);

    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByText(/days without activity are skipped/i)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Post automatically" }));
    fireEvent.change(screen.getByLabelText("Daily summary time"), { target: { value: "18:30" } });
    fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "UTC" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      ...settings,
      noxfeedDailySummary: { enabled: true, timeLocal: "18:30", timezone: "UTC" },
    }));
    expect(screen.getByText(/up to 30 minutes/i)).toBeInTheDocument();
  });
});
