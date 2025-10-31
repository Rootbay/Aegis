# Spam Classifier Model

The desktop client now ships with a lightweight logistic regression model that
runs entirely on the client using [ONNX Runtime Web](https://onnxruntime.ai/).
The model consumes nine engineered features (keyword score, keyword density,
URL count, uppercase ratio, punctuation bursts, repeated characters,
short-message indicator, and context flags for friend requests and profile
content) and outputs a calibrated probability that a message is spam.

| Asset                    | Location                                          | Notes                                                          |
| ------------------------ | ------------------------------------------------- | -------------------------------------------------------------- |
| Model weights            | `static/models/spam-classifier.onnx`              | Float32 logistic regression exported to ONNX.                  |
| Inference layer          | `src/lib/features/security/spamModelInference.ts` | Fetches the ONNX model and executes it with `onnxruntime-web`. |
| Classifier orchestration | `src/lib/features/security/spamClassifier.ts`     | Manages caching, thresholds, fallbacks, and reason strings.    |

## Loading strategy & fallbacks

The inference layer lazily loads the ONNX model the first time spam scoring is
requested. If the model fails to load (for example, because WASM is blocked or
fetching the asset fails), the classifier automatically falls back to the
previous heuristic scoring path. When this happens the user receives a warning
toast: “Advanced spam detection unavailable. Reverting to heuristics.”

### Why keep the heuristics?

The heuristics mirror the previous production behaviour and provide continuity
for environments where the WASM runtime is not available (headless tests,
network-restricted environments, etc.). They retain the original thresholds and
reason messaging so existing moderation workflows remain unchanged.

## Updating the model

1. Train or fine-tune a compact model offline. We currently use a logistic
   regression model with nine inputs.
2. Export the weights to ONNX (Opset 13 works well) with a single `MatMul` +
   `Add` + `Sigmoid` graph. The current artifact was generated with a short
   Python script that builds a logistic regression graph using the `onnx`
   package.
3. Replace `static/models/spam-classifier.onnx` with the new artifact.
4. Run `bun test tests/security/spamClassifier.test.ts` to ensure the mocked
   inference path still behaves as expected.
5. Update the calibration constants in `src/lib/features/security/spamClassifier.ts`
   if the new model’s distribution shifts (e.g., adjust the additive tweaks in
   `adjustModelScore`).
6. Document the change in this file (date, dataset, notable tuning decisions).

## Testing notes

- Unit tests mock the ONNX runtime so they remain deterministic and do not
  require WASM during CI.
- `tests/chat/chatStore.test.ts` includes fixtures for representative ham and
  spam content to verify integration behaviour and metadata handling.
