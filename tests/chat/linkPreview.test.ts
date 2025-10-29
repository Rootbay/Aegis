import { render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({
  browser: false,
}));

vi.mock("$services/tauri", () => ({
  getInvoke: async () => null,
  getListen: async () => null,
}));

vi.mock("../../src/lib/services/tauri", () => ({
  getInvoke: async () => null,
  getListen: async () => null,
}));

const previewMocks = vi.hoisted(() => ({
  getLinkPreviewMetadata: vi.fn(),
}));

vi.mock("../../src/lib/features/chat/utils/linkPreviews", () => previewMocks);

const getLinkPreviewMetadata = previewMocks.getLinkPreviewMetadata;

import LinkPreview from "../../src/lib/features/chat/components/LinkPreview.svelte";
import {
  defaultSettings,
  settings,
} from "../../src/lib/features/settings/stores/settings";

const metadata = {
  url: "https://example.com/article",
  title: "Example Article",
  description: "An example article used for testing.",
  siteName: "Example Site",
  imageUrl: "https://example.com/image.png",
};

describe("LinkPreview", () => {
  beforeEach(() => {
    const baseline = structuredClone(defaultSettings);
    baseline.enableLinkPreviews = true;
    settings.set(baseline);
    getLinkPreviewMetadata.mockReset();
  });

  it("does not attempt to load metadata when previews are disabled", async () => {
    settings.update((current) => ({
      ...current,
      enableLinkPreviews: false,
    }));

    render(LinkPreview, { props: { url: "https://example.com" } });

    await waitFor(() => {
      expect(getLinkPreviewMetadata).not.toHaveBeenCalled();
    });
    expect(screen.queryByText("Loading preview…", { exact: false })).toBeNull();
  });

  it("renders metadata when previews are enabled", async () => {
    getLinkPreviewMetadata.mockResolvedValueOnce(metadata);

    render(LinkPreview, { props: { url: metadata.url } });

    await waitFor(() => {
      expect(getLinkPreviewMetadata).toHaveBeenCalledWith(metadata.url);
    });

    await screen.findByText(metadata.title);
    expect(screen.getByText(metadata.siteName)).toBeTruthy();
    expect(screen.getByText(metadata.description)).toBeTruthy();
  });

  it("shows an error message when metadata is unavailable", async () => {
    getLinkPreviewMetadata.mockResolvedValueOnce(null);

    render(LinkPreview, { props: { url: "https://missing.example" } });

    await waitFor(() => {
      expect(getLinkPreviewMetadata).toHaveBeenCalledWith(
        "https://missing.example",
      );
    });

    const errorMessage = await screen.findByText("Preview unavailable.");
    expect(errorMessage).toBeTruthy();
  });
});
