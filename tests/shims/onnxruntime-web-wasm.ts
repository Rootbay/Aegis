export const env = {
  wasm: {
    numThreads: 1,
    simd: true,
  },
};

export class Tensor<T = number> {
  data: ArrayLike<T>;
  type: string;
  dims: number[];

  constructor(type: string, values: ArrayLike<T>, dims: number[]) {
    this.type = type;
    this.data = values;
    this.dims = dims;
  }
}

export class InferenceSession {
  static async create(_buffer: ArrayBuffer, _options?: unknown) {
    return new InferenceSession();
  }

  async run() {
    return {
      prob: { data: new Float32Array([0.5]) },
    } as Record<string, { data: Float32Array }>;
  }
}
