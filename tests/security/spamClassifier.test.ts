import { describe, it, expect } from "vitest";
import {
  SpamClassifier,
  SPAM_AUTO_MUTE_THRESHOLD,
  SPAM_FLAG_THRESHOLD,
} from "../../src/lib/features/security/spamClassifier";

describe("SpamClassifier", () => {
  it("treats neutral text as ham", async () => {
    const classifier = new SpamClassifier();
    const result = await classifier.scoreText(
      "Hey there, let's catch up tomorrow about the project.",
      { context: "message" },
    );

    expect(result.flagged).toBe(false);
    expect(result.score).toBeLessThan(SPAM_FLAG_THRESHOLD);
    expect(result.reasons).toHaveLength(0);
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
  });

  it("auto mutes extremely suspicious content", async () => {
    const classifier = new SpamClassifier();
    const result = await classifier.scoreText(
      "URGENT!!! CLICK HERE http://scam.test to claim your guaranteed double investment, no risk!!!",
      { context: "message" },
    );

    expect(result.autoMuted || result.score >= SPAM_AUTO_MUTE_THRESHOLD).toBe(true);
  });

  it("caches repeated evaluations for identical inputs", async () => {
    const classifier = new SpamClassifier();
    const first = await classifier.scoreText("free crypto giveaway", {
      context: "message",
      subjectId: "same-user",
    });
    const second = await classifier.scoreText("free crypto giveaway", {
      context: "message",
      subjectId: "same-user",
    });

    expect(second.score).toBe(first.score);
    expect(second.reasons).toEqual(first.reasons);
    expect(second.flagged).toBe(first.flagged);
  });
});
