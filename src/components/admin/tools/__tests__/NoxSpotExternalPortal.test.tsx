import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExternalPortal } from "../NoxSpotSiteManagement";
import type { NoxSpotSite } from "@/lib/types";

const upsert = {
  data: null as { share: { id: string; slug: string; enabled: boolean } } | null,
  error: null,
  isError: false,
  isPending: false,
  mutate: vi.fn(),
  reset: vi.fn(),
};

vi.mock("@/hooks/useNoxSpot", () => ({
  useCreateNoxSpotSite: vi.fn(),
  useDeleteNoxSpotSite: vi.fn(),
  useNoxSpotSites: vi.fn(),
  useRetryNoxSpotDeliveries: vi.fn(),
  useTestNoxSpotSlack: vi.fn(),
  useUpdateNoxSpotSite: vi.fn(),
  useUpsertNoxSpotExternalShare: () => upsert,
  useDeleteNoxSpotExternalShare: () => ({ isPending: false, mutate: vi.fn() }),
}));

const site = {
  id: "site-1",
  name: "Playnist",
  projectId: "project-1",
  repo: "playnist",
  externalShare: null,
} as NoxSpotSite;

describe("NoxSpot external portal management", () => {
  beforeEach(() => {
    upsert.data = null;
    upsert.isPending = false;
    upsert.mutate.mockReset();
  });

  it("shows the portal URL immediately from the successful create response", () => {
    upsert.data = { share: { id: "share-1", slug: "new-share-link", enabled: true } };
    render(<ExternalPortal site={site} confirm={vi.fn() as never} />);

    expect(screen.getByText("Portal link")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /new-share-link/ })).toHaveAttribute(
      "href",
      `${window.location.origin}/share/new-share-link`,
    );
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });

  it("explains the password requirement instead of silently disabling create", async () => {
    const user = userEvent.setup();
    render(<ExternalPortal site={site} confirm={vi.fn() as never} />);

    const createButton = screen.getByRole("button", { name: /create portal/i });
    expect(createButton).toBeEnabled();

    await user.type(screen.getByLabelText("Portal password"), "too-short");
    await user.click(createButton);

    expect(screen.getByRole("alert")).toHaveTextContent("Use at least 12 characters");
    expect(upsert.mutate).not.toHaveBeenCalled();
  });
});
