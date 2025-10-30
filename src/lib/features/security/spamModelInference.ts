import type { InferenceSession, Tensor } from "onnxruntime-web";
import type { SpamContext, SpamFeatures } from "./spamClassifier";

const MODEL_FEATURE_LENGTH = 9;
const MODEL_PATH = "/models/spam-classifier.onnx";

type OrtWasmModule = typeof import("onnxruntime-web/wasm");

function normalize(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) return 0;
  if (value >= max) return 1;
  return value / max;
}

function buildFeatureVector(
  features: SpamFeatures,
  context: SpamContext,
): Float32Array {
  const keywordHitsNorm = normalize(features.keywordHits.length, 4);
  const urlNorm = normalize(features.urlCount, 3);
  const punctuationNorm = normalize(features.punctuationBursts, 3);
  const repetitionNorm = normalize(features.repeatedCharacters, 3);
  const shortMessageFlag = features.tokenCount < 4 ? 1 : 0;
  const friendRequestFlag = context === "friend-request" ? 1 : 0;
  const profileFlag = context === "profile" ? 1 : 0;

  const vector = new Float32Array(MODEL_FEATURE_LENGTH);
  vector[0] = Number.isFinite(features.keywordScore)
    ? Math.max(0, Math.min(1, features.keywordScore))
    : 0;
  vector[1] = keywordHitsNorm;
  vector[2] = urlNorm;
  vector[3] = Math.max(0, Math.min(1, features.uppercaseRatio));
  vector[4] = punctuationNorm;
  vector[5] = repetitionNorm;
  vector[6] = shortMessageFlag;
  vector[7] = friendRequestFlag;
  vector[8] = profileFlag;

  return vector;
}

class SpamModelInference {
  private session: InferenceSession | null = null;
  private ort: OrtWasmModule | null = null;
  private loadPromise: Promise<boolean> | null = null;

  async ensureLoaded(): Promise<boolean> {
    if (this.session) {
      return true;
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this.loadModel();
    const success = await this.loadPromise;
    if (!success) {
      this.loadPromise = null;
    }
    return success;
  }

  private async loadModel(): Promise<boolean> {
    if (typeof fetch === "undefined") {
      return false;
    }

    try {
      const ort = await import("onnxruntime-web/wasm");
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;

      const response = await fetch(MODEL_PATH);
      if (!response.ok) {
        throw new Error(`Model fetch failed with status ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const session = await ort.InferenceSession.create(arrayBuffer, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });

      this.session = session;
      this.ort = ort;
      return true;
    } catch (error) {
      console.warn("Spam model failed to load", error);
      this.session = null;
      this.ort = null;
      return false;
    }
  }

  async run(features: SpamFeatures, context: SpamContext): Promise<number> {
    if (!(await this.ensureLoaded()) || this.session === null || this.ort === null) {
      throw new Error("Spam model not available");
    }

    const vector = buildFeatureVector(features, context);
    const input = new this.ort.Tensor("float32", vector, [1, MODEL_FEATURE_LENGTH]);
    const outputs = await this.session.run({ features: input as Tensor });
    const tensor = outputs.prob as Tensor | undefined;
    const raw = tensor?.data?.[0];
    if (typeof raw !== "number") {
      throw new Error("Spam model produced invalid output");
    }
    return Math.max(0, Math.min(1, raw));
  }
}

export const spamModelInference = new SpamModelInference();

export function createFeatureVector(
  features: SpamFeatures,
  context: SpamContext,
): Float32Array {
  return buildFeatureVector(features, context);
}
