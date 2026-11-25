import { kmeans } from "ml-kmeans";
import { UMAP } from "umap-js";

export const MIN_TOPICS = 3;
export const MAX_TOPICS = 12;
export const MAP_SEED = 42;

/** Número de temas: k ≈ √(n/2), entre 3 y 12, y nunca mayor que n. */
export function chooseK(n: number): number {
  if (n <= 0) return 0;
  const k = Math.round(Math.sqrt(n / 2));
  return Math.min(Math.max(k, MIN_TOPICS), MAX_TOPICS, n);
}

/** Vecinos de UMAP: crece con √n, entre 2 y 15, y siempre menor que n. */
export function chooseNeighbors(n: number): number {
  const wanted = Math.min(Math.max(Math.round(Math.sqrt(n)), 2), 15);
  return Math.max(1, Math.min(wanted, n - 1));
}

/**
 * Un embedding normalizado válido tiene todos los valores finitos y norma ≈ 1.
 * Detecta salidas corruptas del modelo (p. ej. mitades fp16 sin convertir).
 */
export function isValidEmbedding(vector: ArrayLike<number>): boolean {
  if (vector.length === 0) return false;
  let sumSquares = 0;
  for (let i = 0; i < vector.length; i++) {
    const value = vector[i];
    if (!Number.isFinite(value)) return false;
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares);
  return norm > 0.9 && norm < 1.1;
}

/** ¿Los dos listados contienen exactamente los mismos ids (sin importar el orden)? */
export function sameIdSet(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return set.size === a.length && b.every((id) => set.has(id));
}

/** Generador pseudoaleatorio con semilla (mulberry32): mismo seed, misma secuencia. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Valor en el percentil `q` (0-1) de una lista ya ordenada. */
function percentile(sorted: number[], q: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.floor(q * (sorted.length - 1)),
  );
  return sorted[index];
}

/** Radio de la esfera que contiene al 70 % de los puntos tras normalizar. */
export const CORE_RADIUS = 0.8;
/** Percentil de distancia al centro que se lleva a CORE_RADIUS. */
const CORE_PERCENTILE = 0.7;
/** Los atípicos se comprimen hasta CORE_RADIUS × este factor como máximo. */
export const OUTLIER_FACTOR = 1.3;

/**
 * Centra los puntos en su mediana y los escala con una medida robusta: el 70 %
 * de los puntos queda dentro de una esfera de radio 0.8 y los atípicos se
 * comprimen suavemente (como mucho hasta 0.8 × 1.3). Así unos pocos puntos lejanos
 * no aplastan al resto en un solo punto. Si todos son iguales, devuelve ceros.
 */
export function normalizeCoords(points: number[][]): number[][] {
  if (points.length === 0) return [];
  const dims = points[0].length;
  const center = Array.from({ length: dims }, (_, d) => {
    const sorted = points.map((p) => p[d]).sort((a, b) => a - b);
    return percentile(sorted, 0.5);
  });
  const offsets = points.map((p) => p.map((v, d) => v - center[d]));
  const radii = offsets.map((o) => Math.hypot(...o));
  const sortedRadii = [...radii].sort((a, b) => a - b);
  // Si más de la mitad coincide con el centro, se usa el radio máximo.
  const scale =
    percentile(sortedRadii, CORE_PERCENTILE) ||
    sortedRadii[sortedRadii.length - 1];
  if (!scale) return points.map((p) => p.map(() => 0));

  return offsets.map((o, i) => {
    const r = radii[i] / scale;
    const mapped =
      r <= 1 ? r : 1 + (OUTLIER_FACTOR - 1) * (1 - Math.exp(-(r - 1)));
    const factor = radii[i] === 0 ? 0 : (mapped * CORE_RADIUS) / radii[i];
    return o.map((v) => v * factor);
  });
}

/** Agrupa puntos con k-means (k-means++ con semilla). Devuelve el tema de cada punto. */
export function clusterPoints(
  points: number[][],
  k: number,
  seed = MAP_SEED,
): number[] {
  const n = points.length;
  if (n === 0) return [];
  if (k <= 1) return points.map(() => 0);
  if (n <= k) return points.map((_, i) => i);
  const result = kmeans(points, k, { seed, initialization: "kmeans++" });
  return result.clusters;
}

/**
 * Proyecta vectores a 3D con UMAP (con semilla, así el mapa es reproducible).
 * Con muy pocos puntos UMAP no es viable: se colocan en posiciones
 * pseudoaleatorias deterministas. Pensado para ejecutarse en un worker.
 */
export async function layout3d(
  vectors: number[][],
  options: {
    seed?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<number[][]> {
  const { seed = MAP_SEED, onProgress } = options;
  const n = vectors.length;
  if (n === 0) return [];

  if (n < 5) {
    const random = seededRandom(seed);
    return normalizeCoords(
      vectors.map(() => [random() - 0.5, random() - 0.5, random() - 0.5]),
    );
  }

  const umap = new UMAP({
    nComponents: 3,
    nNeighbors: chooseNeighbors(n),
    minDist: 0.3,
    spread: 1.5,
    random: seededRandom(seed),
  });
  // Pasos manuales (sincronos): se ejecuta dentro de un worker, así que no
  // bloquea la UI, y es mucho más rápido que fitAsync (un setTimeout por época).
  const totalEpochs = umap.initializeFit(vectors);
  for (let epoch = 0; epoch < totalEpochs; epoch++) {
    umap.step();
    if (epoch % 10 === 0 || epoch === totalEpochs - 1) {
      onProgress?.(epoch + 1, totalEpochs);
    }
  }
  const embedding = umap.getEmbedding();
  return normalizeCoords(embedding);
}
