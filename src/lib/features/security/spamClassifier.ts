export const SPAM_FLAG_THRESHOLD = 0.7;
export const SPAM_AUTO_MUTE_THRESHOLD = 0.9;

type SpamContext = "message" | "friend-request" | "profile";

export interface SpamClassification {
  score: number;
  label: "spam" | "ham";
  flagged: boolean;
  autoMuted: boolean;
  reasons: string[];
  context: SpamContext;
}

interface ScoreOptions {
  context?: SpamContext;
  subjectId?: string;
}

interface SpamFeatures {
  keywordScore: number;
  keywordHits: string[];
  urlCount: number;
  uppercaseRatio: number;
  punctuationBursts: number;
  repeatedCharacters: number;
  tokenCount: number;
}

const KEYWORD_WEIGHTS: Record<string, number> = {
  free: 0.28,
  win: 0.27,
  winner: 0.3,
  "buy now": 0.32,
  "act now": 0.28,
  "limited offer": 0.26,
  "click": 0.24,
  "click here": 0.32,
  urgent: 0.24,
  guarantee: 0.22,
  investment: 0.25,
  crypto: 0.24,
  "double your": 0.28,
  "no risk": 0.2,
  gift: 0.22,
};

const URL_REGEX = /(https?:\/\/|www\.)\S+/gi;
const PUNCTUATION_BURST_REGEX = /([!?])\1{2,}/g;
const REPEATING_CHAR_REGEX = /(.)\1{3,}/g;
const WORD_REGEX = /[a-z0-9]+/gi;

class MockSpamModel {
  private loaded = false;

  async load() {
    if (this.loaded) return;
    await Promise.resolve();
    this.loaded = true;
  }

  predict(features: SpamFeatures, context: SpamContext): number {
    const base = context === "friend-request" ? 0.1 : 0.06;
    const urlContribution = Math.min(0.32, features.urlCount * 0.18);
    const uppercaseContribution =
      features.uppercaseRatio > 0.65
        ? 0.18
        : features.uppercaseRatio > 0.45
          ? 0.1
          : 0;
    const punctuationContribution = Math.min(
      0.14,
      features.punctuationBursts * 0.07,
    );
    const repetitionContribution = Math.min(
      0.12,
      features.repeatedCharacters * 0.06,
    );
    const shortMessagePenalty = features.tokenCount < 3 ? 0.08 : 0;

    const contextBoost =
      context === "friend-request" && features.keywordScore > 0
        ? 0.08
        : 0;

    const rawScore =
      base +
      features.keywordScore +
      urlContribution +
      uppercaseContribution +
      punctuationContribution +
      repetitionContribution +
      shortMessagePenalty +
      contextBoost;

    return clamp(rawScore, 0, 1);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractFeatures(text: string): SpamFeatures {
  const lower = text.toLowerCase();
  let keywordScore = 0;
  const keywordHits: string[] = [];

  for (const [phrase, weight] of Object.entries(KEYWORD_WEIGHTS)) {
    const regex = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi");
    const matches = lower.match(regex);
    if (matches && matches.length > 0) {
      keywordScore += weight * matches.length;
      keywordHits.push(phrase);
    }
  }

  const urlMatches = lower.match(URL_REGEX);
  const punctuationMatches = lower.match(PUNCTUATION_BURST_REGEX);
  const repeatingMatches = lower.match(REPEATING_CHAR_REGEX);

  const tokens = lower.match(WORD_REGEX) ?? [];
  const uppercaseChars = (text.match(/[A-Z]/g) ?? []).length;
  const alphaChars = (text.match(/[A-Za-z]/g) ?? []).length;
  const uppercaseRatio = alphaChars === 0 ? 0 : uppercaseChars / alphaChars;

  return {
    keywordScore,
    keywordHits,
    urlCount: urlMatches ? urlMatches.length : 0,
    punctuationBursts: punctuationMatches ? punctuationMatches.length : 0,
    repeatedCharacters: repeatingMatches ? repeatingMatches.length : 0,
    tokenCount: tokens.length,
    uppercaseRatio,
  };
}

export class SpamClassifier {
  private model = new MockSpamModel();
  private loaded = false;
  private cache = new Map<string, SpamClassification>();

  async loadModel() {
    if (!this.loaded) {
      await this.model.load();
      this.loaded = true;
    }
  }

  clearCache() {
    this.cache.clear();
  }

  private buildCacheKey(text: string, options: ScoreOptions): string {
    return JSON.stringify({
      text,
      context: options.context ?? "message",
      subjectId: options.subjectId ?? null,
    });
  }

  async scoreText(
    text: string,
    options: ScoreOptions = {},
  ): Promise<SpamClassification> {
    const normalized = text?.toString?.().trim() ?? "";
    const context = options.context ?? "message";
    if (normalized.length === 0) {
      return {
        score: 0,
        label: "ham",
        flagged: false,
        autoMuted: false,
        reasons: [],
        context,
      };
    }

    const cacheKey = this.buildCacheKey(normalized, options);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    await this.loadModel();
    const features = extractFeatures(normalized);
    const rawScore = this.model.predict(features, context);

    let adjustedScore = rawScore;
    if (features.keywordHits.length > 2) {
      adjustedScore = Math.min(1, adjustedScore + 0.08);
    }
    if (features.urlCount > 1) {
      adjustedScore = Math.min(1, adjustedScore + 0.06);
    }

    const flagged = adjustedScore >= SPAM_FLAG_THRESHOLD;
    const autoMuted = adjustedScore >= SPAM_AUTO_MUTE_THRESHOLD;

    const reasons: string[] = [];
    if (features.keywordHits.length > 0) {
      const sample = features.keywordHits.slice(0, 3).join(", ");
      reasons.push(
        `Contains spam keywords${
          features.keywordHits.length > 3 ? " (and more)" : ""
        }: ${sample}`,
      );
    }
    if (features.urlCount > 0) {
      reasons.push(`Contains ${features.urlCount} link${
        features.urlCount > 1 ? "s" : ""
      }`);
    }
    if (features.uppercaseRatio > 0.6) {
      reasons.push("High uppercase ratio");
    }
    if (features.punctuationBursts > 0) {
      reasons.push("Repeated punctuation patterns");
    }
    if (features.repeatedCharacters > 0) {
      reasons.push("Repeated characters typical of spam");
    }

    if (reasons.length === 0 && flagged) {
      reasons.push("Heuristic spam score exceeded threshold");
    }

    const classification: SpamClassification = {
      score: Number(adjustedScore.toFixed(3)),
      label: flagged ? "spam" : "ham",
      flagged,
      autoMuted,
      reasons,
      context,
    };

    this.cache.set(cacheKey, classification);
    return classification;
  }

  isFlagged(score: number): boolean {
    return score >= SPAM_FLAG_THRESHOLD;
  }

  shouldAutoMute(score: number): boolean {
    return score >= SPAM_AUTO_MUTE_THRESHOLD;
  }
}

export const spamClassifier = new SpamClassifier();
