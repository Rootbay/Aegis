import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureLoadedMock = vi.hoisted(() => vi.fn<[], Promise<boolean>>());
const runMock = vi.hoisted(() => vi.fn());

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: {
    addToast: vi.fn(),
  },
}));

vi.mock("../../src/lib/stores/ToastStore", () => ({
  toasts: {
    addToast: vi.fn(),
  },
}));

vi.mock("../../src/lib/features/security/spamModelInference", () => ({
  spamModelInference: {
    ensureLoaded: ensureLoadedMock,
    run: runMock,
  },
}));

import {
  SpamClassifier,
  SPAM_AUTO_MUTE_THRESHOLD,
  SPAM_FLAG_THRESHOLD,
} from "../../src/lib/features/security/spamClassifier";

const weights = {
  bias: -2.1,
  keywordScore: 3.6,
  keywordHitsNorm: 1.1,
  urlNorm: 1.8,
  uppercaseRatio: 1.2,
  punctNorm: 1.0,
  repeatNorm: 0.9,
  shortMessage: 1.3,
  friendRequest: 0.7,
  profile: 0.3,
};

function logisticScore(
  features: Parameters<typeof runMock>[0],
  context: Parameters<typeof runMock>[1],
) {
  const keywordHitsNorm = Math.min(features.keywordHits.length, 4) / 4;
  const urlNorm = Math.min(features.urlCount, 3) / 3;
  const punctuationNorm = Math.min(features.punctuationBursts, 3) / 3;
  const repetitionNorm = Math.min(features.repeatedCharacters, 3) / 3;
  const shortMessageFlag = features.tokenCount < 4 ? 1 : 0;
  const friendFlag = context === "friend-request" ? 1 : 0;
  const profileFlag = context === "profile" ? 1 : 0;

  const linear =
    weights.bias +
    weights.keywordScore * Math.min(1, Math.max(0, features.keywordScore)) +
    weights.keywordHitsNorm * keywordHitsNorm +
    weights.urlNorm * urlNorm +
    weights.uppercaseRatio * Math.min(1, Math.max(0, features.uppercaseRatio)) +
    weights.punctNorm * punctuationNorm +
    weights.repeatNorm * repetitionNorm +
    weights.shortMessage * shortMessageFlag +
    weights.friendRequest * friendFlag +
    weights.profile * profileFlag;

  return 1 / (1 + Math.exp(-linear));
}

describe("SpamClassifier", () => {
  beforeEach(() => {
    ensureLoadedMock.mockReset();
    runMock.mockReset();
    ensureLoadedMock.mockResolvedValue(true);
    runMock.mockImplementation(async (features, context) =>
      logisticScore(features, context),
    );
  });

  it("treats neutral text as ham", async () => {
    const classifier = new SpamClassifier();
    const result = await classifier.scoreText(
      "Hey there, let's catch up tomorrow about the project.",
      { context: "message" },
    );

    expect(result.flagged).toBe(false);
    expect(result.score).toBeLessThan(SPAM_FLAG_THRESHOLD);
    expect(result.reasons).toHaveLength(0);
    expect(runMock).toHaveBeenCalled();
  });

  it("flags aggressive promotional language", async () => {
    const classifier = new SpamClassifier();
    const result = await classifier.scoreText(
      "WIN a FREE limited offer!!! Click http://sp.am now to double your crypto!",
      { context: "message", subjectId: "user-spam" },
    );

    expect(result.flagged).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(SPAM_FLAG_THRESHOLD);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(runMock).toHaveBeenCalled();
  });

  it("auto mutes extremely suspicious content", async () => {
    const classifier = new SpamClassifier();
    const result = await classifier.scoreText(
      "URGENT!!! CLICK HERE http://scam.test to claim your guaranteed double investment, no risk!!!",
      { context: "message" },
    );

    expect(result.autoMuted || result.score >= SPAM_AUTO_MUTE_THRESHOLD).toBe(
      true,
    );
    expect(runMock).toHaveBeenCalled();
  });

  it("falls back to heuristics when the model is unavailable", async () => {
    ensureLoadedMock.mockResolvedValueOnce(false);
    const classifier = new SpamClassifier();
    const result = await classifier.scoreText("free crypto giveaway", {
      context: "message",
      subjectId: "same-user",
    });

    expect(runMock).not.toHaveBeenCalled();
    expect(result.score).toBeGreaterThan(0);
  });

  it("caches repeated evaluations for identical inputs", async () => {
    const classifier = new SpamClassifier();
    const first = await classifier.scoreText("free crypto giveaway", {
      context: "message",
      subjectId: "same-user",
    });
    runMock.mockClear();
    const second = await classifier.scoreText("free crypto giveaway", {
      context: "message",
      subjectId: "same-user",
    });

    expect(runMock).not.toHaveBeenCalled();
    expect(second.score).toBe(first.score);
    expect(second.reasons).toEqual(first.reasons);
    expect(second.flagged).toBe(first.flagged);
  });
});
