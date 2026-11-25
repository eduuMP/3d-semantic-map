/**
 * Modelos de WebLLM por orden de preferencia. WebGPU no informa de la VRAM
 * libre, así que se elige con heurísticas y, si la carga falla, se baja al
 * siguiente (ver `nextFallback`).
 */
export type LlmModel = {
  /** Familia (sin variante de precisión). */
  family: "7b" | "3b" | "1.5b";
  f16: string;
  f32: string;
  /** VRAM aproximada con f16, en MB (según WebLLM). */
  vramMb: number;
  /**
   * Solo se usa si ya funcionó en este equipo (queda guardado). Los modelos
   * grandes pueden colgar la GPU en Windows (TDR) en portátiles con 8 GB.
   */
  optIn?: boolean;
};

export const LLM_MODELS: readonly LlmModel[] = [
  {
    family: "7b",
    f16: "Qwen2.5-7B-Instruct-q4f16_1-MLC",
    f32: "Qwen2.5-7B-Instruct-q4f32_1-MLC",
    vramMb: 5107,
    optIn: true,
  },
  {
    family: "3b",
    f16: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    f32: "Qwen2.5-3B-Instruct-q4f32_1-MLC",
    vramMb: 2505,
  },
  {
    family: "1.5b",
    f16: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    f32: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC",
    vramMb: 1630,
  },
];

export type GpuCapabilities = {
  /** El adaptador ofrece `shader-f16`. */
  hasF16: boolean;
  /** `limits.maxBufferSize` del adaptador, en bytes. */
  maxBufferSize: number;
};

/** Por debajo de estos tamaños de buffer ni se intenta el modelo grande. */
export const MIN_BUFFER_FOR_7B = 2 * 1024 ** 3;
export const MIN_BUFFER_FOR_3B = 1024 ** 3;

function modelId(model: LlmModel, hasF16: boolean): string {
  return hasF16 ? model.f16 : model.f32;
}

/**
 * Lista ordenada de ids a probar. `preferred` es el id que funcionó la última
 * vez en este equipo: si sigue siendo viable, se empieza por él (y se
 * conservan por debajo los más pequeños como respaldo).
 */
export function pickCandidates(
  caps: GpuCapabilities,
  preferred?: string | null,
): string[] {
  const viable = LLM_MODELS.filter((model) => {
    const isPreferred =
      !!preferred && (model.f16 === preferred || model.f32 === preferred);
    if (model.optIn && !isPreferred) return false;
    if (model.family === "7b") return caps.maxBufferSize >= MIN_BUFFER_FOR_7B;
    if (model.family === "3b") return caps.maxBufferSize >= MIN_BUFFER_FOR_3B;
    return true;
  });
  const ids = viable.map((m) => modelId(m, caps.hasF16));
  if (preferred && ids.includes(preferred)) {
    return ids.slice(ids.indexOf(preferred));
  }
  return ids;
}

/** Siguiente id tras un fallo de carga, o null si no queda ninguno. */
export function nextFallback(
  candidates: readonly string[],
  failed: string,
): string | null {
  const index = candidates.indexOf(failed);
  if (index === -1) return null;
  return candidates[index + 1] ?? null;
}

/**
 * ¿El error indica que la GPU se perdió (TDR de Windows, falta de memoria) o
 * que el motor ya quedó inservible? Hay que descartar el modelo y bajar al
 * siguiente.
 */
export function isDeviceLostError(message: string): boolean {
  return /device[ _](was )?(lost|hung|removed)|already been disposed|deleted object|model not loaded|out of memory/i.test(
    message,
  );
}

const LAST_OK_KEY = "llm-model-ok-v2";

/** Lee el modelo que funcionó antes (null si no hay o no hay localStorage). */
export function readLastGoodModel(
  storage: Pick<Storage, "getItem"> | undefined,
): string | null {
  try {
    return storage?.getItem(LAST_OK_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveLastGoodModel(
  storage: Pick<Storage, "setItem"> | undefined,
  id: string,
) {
  try {
    storage?.setItem(LAST_OK_KEY, id);
  } catch {
    // Sin almacenamiento: se vuelve a decidir en la próxima carga.
  }
}
