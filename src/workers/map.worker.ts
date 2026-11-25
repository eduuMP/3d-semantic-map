/// <reference lib="webworker" />
import { env, pipeline } from "@huggingface/transformers";
import { db } from "../lib/db";
import {
  chooseK,
  clusterPoints,
  isValidEmbedding,
  layout3d,
  sameIdSet,
} from "../lib/map-math";
import type { MapErrorCode, MapMessage, MapRequest } from "../lib/map-protocol";
import { aggregateDownloadProgress } from "../lib/map-view";

const MODEL_ID = "Xenova/multilingual-e5-small";
const BATCH_SIZE = 16;
const MAX_MODEL_TOKENS = 512;

type Dtype = "fp16" | "fp32";

const post = (message: MapMessage) => self.postMessage(message);

class MapError extends Error {
  constructor(
    readonly code: MapErrorCode,
    message: string,
  ) {
    super(message);
  }
}

// Tipos mínimos de lo que usamos de Transformers.js (evita `any`).
type TensorLike = { data: ArrayLike<number>; dims: number[] };
type Extractor = ((
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<TensorLike>) & {
  tokenizer?: (
    texts: string[],
    options: { padding: boolean; truncation: boolean },
  ) => { attention_mask: { tolist: () => (number | bigint)[][] } };
  dispose?: () => Promise<void>;
};

type GpuNavigator = {
  gpu?: {
    requestAdapter: () => Promise<{ features: Set<string> } | null>;
  };
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function webGpuInfo(): Promise<{ fp16: boolean }> {
  const gpu = (self.navigator as unknown as GpuNavigator).gpu;
  if (!gpu) throw new MapError("no-webgpu", "navigator.gpu no existe");
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new MapError("no-webgpu", "sin adaptador WebGPU");
  return { fp16: adapter.features.has("shader-f16") };
}

async function loadExtractor(dtype: Dtype): Promise<Extractor> {
  env.allowLocalModels = false;
  env.useBrowserCache = true;

  const files: Record<string, { loaded: number; total: number }> = {};
  const progress_callback = (info: {
    status: string;
    file?: string;
    loaded?: number;
    total?: number;
  }) => {
    if (info.status !== "progress" || !info.file) return;
    files[info.file] = { loaded: info.loaded ?? 0, total: info.total ?? 0 };
    const sum = aggregateDownloadProgress(files);
    post({
      type: "progress",
      phase: "model",
      current: sum.loaded,
      total: sum.total,
      downloadedMb: Math.round(sum.loaded / 1e6),
      totalMb: Math.round(sum.total / 1e6),
    });
  };

  post({ type: "progress", phase: "model", current: 0, total: 0 });
  try {
    return (await pipeline("feature-extraction", MODEL_ID, {
      device: "webgpu",
      dtype,
      progress_callback,
    })) as unknown as Extractor;
  } catch (error) {
    throw new MapError("model", messageOf(error));
  }
}

/** Cuántos textos superan el límite del modelo. null si no se puede medir. */
function countTruncated(extractor: Extractor, texts: string[]): number | null {
  try {
    if (!extractor.tokenizer) return null;
    const encoded = extractor.tokenizer(texts, {
      padding: true,
      truncation: false,
    });
    return encoded.attention_mask
      .tolist()
      .filter(
        (row) =>
          row.reduce<number>((sum, v) => sum + Number(v), 0) > MAX_MODEL_TOKENS,
      ).length;
  } catch {
    return null;
  }
}

/**
 * Embeddings de un lote. Valida el resultado: si el modelo devolviera un tipo
 * de dato inesperado (p. ej. mitades fp16 sin convertir) los vectores serían
 * basura sin que saltara ningún error.
 */
async function embedBatch(
  extractor: Extractor,
  texts: string[],
): Promise<Float32Array[]> {
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  const dim = output.dims[output.dims.length - 1];
  const data = Float32Array.from(output.data);
  if (!dim || data.length !== dim * texts.length) {
    throw new MapError("embedding", "El modelo devolvió un tamaño inesperado");
  }
  const vectors = texts.map((_, row) => data.slice(row * dim, (row + 1) * dim));
  if (!vectors.every(isValidEmbedding)) {
    throw new MapError("embedding", "El modelo devolvió vectores no válidos");
  }
  return vectors;
}

async function build(subjectId: number) {
  if (!(await db.subjects.get(subjectId))) {
    throw new MapError("no-subject", "La asignatura no existe");
  }
  const chunks = await db.chunks.where("subjectId").equals(subjectId).toArray();
  if (chunks.length === 0) {
    throw new MapError("no-chunks", "Sin fragmentos");
  }

  // 1. Embeddings solo de los fragmentos que aún no tienen vector.
  const pending = chunks.filter((c) => !c.vector);
  let truncated: number | null = 0;
  if (pending.length > 0) {
    let dtype: Dtype = (await webGpuInfo()).fp16 ? "fp16" : "fp32";
    let extractor = await loadExtractor(dtype);
    try {
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE);
        // e5 pide el prefijo "passage: " en los documentos.
        const texts = batch.map((c) => `passage: ${c.text}`);
        const counted = countTruncated(extractor, texts);
        truncated =
          counted === null || truncated === null ? null : truncated + counted;

        let vectors: Float32Array[];
        try {
          vectors = await embedBatch(extractor, texts);
        } catch (error) {
          if (dtype !== "fp16") throw error;
          // Los fallos de fp16 suelen salir al compilar los kernels en la
          // primera inferencia: se reintenta todo en fp32.
          console.warn("[map.worker] fp16 falló, reintentando en fp32", error);
          await extractor.dispose?.().catch(() => undefined);
          dtype = "fp32";
          extractor = await loadExtractor(dtype);
          vectors = await embedBatch(extractor, texts);
        }

        // Se guarda por lotes: si algo falla, lo ya calculado no se pierde.
        await db.chunks.bulkUpdate(
          batch.map((chunk, row) => ({
            key: chunk.id,
            changes: { vector: vectors[row] },
          })),
        );
        for (const [row, chunk] of batch.entries()) chunk.vector = vectors[row];
        post({
          type: "progress",
          phase: "embedding",
          current: Math.min(i + BATCH_SIZE, pending.length),
          total: pending.length,
        });
      }
    } catch (error) {
      if (error instanceof MapError) throw error;
      throw new MapError("embedding", messageOf(error));
    } finally {
      await extractor.dispose?.().catch(() => undefined);
    }
  }

  // 2. UMAP a 3D con todos los vectores de la asignatura.
  post({ type: "progress", phase: "layout", current: 0, total: 1 });
  const vectors = chunks.map((c) => Array.from(c.vector!));
  const coords = await layout3d(vectors, {
    onProgress: (done, total) =>
      post({ type: "progress", phase: "layout", current: done, total }),
  });

  // 3. k-means sobre las coordenadas 3D.
  post({ type: "progress", phase: "clustering", current: 0, total: 1 });
  const labels = clusterPoints(coords, chooseK(chunks.length));

  // 4. Guardado atómico: temas nuevos y coordenadas.
  post({ type: "progress", phase: "saving", current: 0, total: 1 });
  const usedLabels = [...new Set(labels)].sort((a, b) => a - b);
  await db.transaction("rw", [db.subjects, db.chunks, db.topics], async () => {
    if (!(await db.subjects.get(subjectId))) {
      throw new MapError("no-subject", "La asignatura ya no existe");
    }
    // Si se quitaron o añadieron PDFs durante el cálculo, el mapa ya no
    // corresponde a los apuntes actuales.
    const currentIds = await db.chunks
      .where("subjectId")
      .equals(subjectId)
      .primaryKeys();
    if (
      !sameIdSet(
        chunks.map((c) => c.id),
        currentIds,
      )
    ) {
      throw new MapError(
        "changed",
        "Los fragmentos cambiaron durante el cálculo",
      );
    }
    await db.topics.where("subjectId").equals(subjectId).delete();
    const topicIdByLabel = new Map<number, number>();
    for (const [i, label] of usedLabels.entries()) {
      const id = await db.topics.add({ subjectId, name: `Tema ${i + 1}` });
      topicIdByLabel.set(label, id);
    }
    await db.chunks.bulkUpdate(
      chunks.map((chunk, i) => ({
        key: chunk.id,
        changes: {
          xyz: coords[i] as [number, number, number],
          topicId: topicIdByLabel.get(labels[i]),
        },
      })),
    );
  });

  post({
    type: "done",
    points: chunks.length,
    topics: usedLabels.length,
    embedded: pending.length,
    truncated,
  });
}

self.onmessage = async (event: MessageEvent<MapRequest>) => {
  if (event.data.type !== "build") return;
  try {
    await build(event.data.subjectId);
  } catch (error) {
    console.error("[map.worker]", error);
    if (error instanceof MapError) {
      post({ type: "error", code: error.code, message: error.message });
    } else {
      post({ type: "error", code: "unknown", message: messageOf(error) });
    }
  }
};
