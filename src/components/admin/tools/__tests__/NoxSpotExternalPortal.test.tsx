import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExternalPortal } from "../NoxSpotSiteManagement";
import type { NoxSpotSite } from "@/lib/types";

const upsert = {
  data: { share: { id: "share-1", slug: "new-share-link", enabled: true } },
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
  it("shows the portal URL immediately from the successful create response", () => {
    render(<ExternalPortal site={site} confirm={vi.fn() as never} />);

    expect(screen.getByText("Portal link")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /new-share-link/ })).toHaveAttribute(
      "href",
      `${window.location.origin}/share/new-share-link`,
    );
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });
});
