export type PageText = { page: number; text: string };
export type Chunk = { page: number; index: number; text: string };

export type ChunkOptions = {
  /** Palabras máximas por fragmento (~500 tokens ≈ 350 palabras en español). */
  maxWords?: number;
  /** Palabras de solape entre fragmentos consecutivos (~50 tokens ≈ 35 palabras). */
  overlapWords?: number;
  /** Páginas con menos palabras que esto se descartan (p. ej. solo el nº de página). */
  minWords?: number;
};

export const DEFAULT_CHUNK_OPTIONS = {
  maxWords: 350,
  overlapWords: 35,
  minWords: 15,
} as const satisfies Required<ChunkOptions>;

/** Une palabras cortadas con guion a final de línea y colapsa espacios. */
export function normalizePageText(raw: string): string {
  return raw
    .replace(/([\p{L}])-\s*\n\s*([\p{Ll}])/gu, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Trocea el texto por página. Los fragmentos nunca cruzan páginas, así la
 * cita `[p. X]` siempre es exacta. `index` es el orden global del fragmento.
 */
export function chunkPages(
  pages: PageText[],
  options: ChunkOptions = {},
): Chunk[] {
  const { maxWords, overlapWords, minWords } = {
    ...DEFAULT_CHUNK_OPTIONS,
    ...options,
  };
  if (maxWords <= 0) throw new Error("maxWords debe ser mayor que 0");
  if (overlapWords < 0 || overlapWords >= maxWords) {
    throw new Error("overlapWords debe estar entre 0 y maxWords - 1");
  }

  const step = maxWords - overlapWords;
  const chunks: Chunk[] = [];

  for (const { page, text } of pages) {
    const words = normalizePageText(text).split(" ").filter(Boolean);
    if (words.length === 0 || words.length < minWords) continue;

    for (let start = 0; start < words.length; start += step) {
      const slice = words.slice(start, start + maxWords);
      chunks.push({ page, index: chunks.length, text: slice.join(" ") });
      if (start + maxWords >= words.length) break;
    }
  }

  return chunks;
}
