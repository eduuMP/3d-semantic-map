import { env, pipeline } from "@huggingface/transformers";
import { isValidEmbedding } from "./map-math";
import { aggregateDownloadProgress } from "./map-view";

/** Mismo modelo que el mapa: los vectores de la pregunta y de los fragmentos son comparables. */
export const EMBEDDING_MODEL_ID = "Xenova/multilingual-e5-small";

type Dtype = "fp16" | "fp32";
type TensorLike = { data: ArrayLike<number>; dims: number[] };
type Extractor = ((
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<TensorLike>) & { dispose?: () => Promise<void> };

type GpuNavigator = {
  gpu?: {
    requestAdapter: () => Promise<{ features: Set<string> } | null>;
  };
};

export type EmbedderProgress = (downloadedMb: number, totalMb: number) => void;

let extractorPromise: Promise<{ extractor: Extractor; dtype: Dtype }> | null =
  null;

async function hasFp16(): Promise<boolean> {
  const gpu = (self.navigator as unknown as GpuNavigator).gpu;
  const adapter = gpu ? await gpu.requestAdapter() : null;
  return adapter?.features.has("shader-f16") ?? false;
}

async function load(dtype: Dtype, onProgress?: EmbedderProgress) {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const files: Record<string, { loaded: number; total: number }> = {};
  const extractor = (await pipeline("feature-extraction", EMBEDDING_MODEL_ID, {
    device: "webgpu",
    dtype,
    progress_callback: (info: {
      status: string;
      file?: string;
      loaded?: number;
      total?: number;
    }) => {
      if (info.status !== "progress" || !info.file) return;
      files[info.file] = { loaded: info.loaded ?? 0, total: info.total ?? 0 };
      const sum = aggregateDownloadProgress(files);
      onProgress?.(Math.round(sum.loaded / 1e6), Math.round(sum.total / 1e6));
    },
  })) as unknown as Extractor;
  return { extractor, dtype };
}

/** Embedding normalizado de un texto, o lanza si el modelo devuelve basura. */
async function embedOne(extractor: Extractor, text: string) {
  const output = await extractor([text], { pooling: "mean", normalize: true });
  const vector = Float32Array.from(output.data);
  if (!isValidEmbedding(vector)) {
    throw new Error("El modelo de embeddings devolvió un vector no válido");
  }
  return vector;
}

/**
 * Embedding de una pregunta (prefijo `query: `, como pide e5). El modelo se
 * carga una vez y se reutiliza; fp16 si la GPU lo admite, con respaldo fp32.
 */
export async function embedQuery(
  question: string,
  onProgress?: EmbedderProgress,
): Promise<Float32Array> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const dtype: Dtype = (await hasFp16()) ? "fp16" : "fp32";
      return load(dtype, onProgress);
    })();
    extractorPromise.catch(() => {
      extractorPromise = null;
    });
  }
  const loaded = await extractorPromise;
  const text = `query: ${question}`;
  try {
    return await embedOne(loaded.extractor, text);
  } catch (error) {
    if (loaded.dtype !== "fp16") throw error;
    // Los fallos de fp16 suelen salir en la primera inferencia: se reintenta en fp32.
    console.warn("[embedder] fp16 falló, reintentando en fp32", error);
    await loaded.extractor.dispose?.().catch(() => undefined);
    extractorPromise = load("fp32", onProgress);
    const retry = await extractorPromise;
    return embedOne(retry.extractor, text);
  }
}

/** Libera el modelo (p. ej. si la GPU se perdió y hay que volver a cargarlo). */
export async function disposeEmbedder() {
  const current = extractorPromise;
  extractorPromise = null;
  try {
    await (await current)?.extractor.dispose?.();
  } catch {
    // Ya estaba muerto.
  }
}
