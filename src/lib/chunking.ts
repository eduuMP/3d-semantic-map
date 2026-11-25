export type PageText = { page: number; text: string };
export type Chunk = { page: number; index: number; text: string };

export type ChunkOptions = {
  /** Palabras máximas por fragmento (~500 tokens ≈ 350 palabras en español). */
  maxWords?: number;
  /** Palabras de solape entre fragmentos consecutivos (~50 tokens ≈ 35 palabras). */
  overlapWords?: number;
  /** Páginas con menos palabras que esto se descartan (p. ej. solo el nº de página). */
  minWords?: number;
  /** Si tras un fragmento quedan menos palabras nuevas que esto, se absorben en él. */
  minTailWords?: number;
};

export const DEFAULT_CHUNK_OPTIONS = {
  maxWords: 350,
  overlapWords: 35,
  minWords: 4,
  minTailWords: 15,
} as const satisfies Required<ChunkOptions>;

/** Acento suelto (como lo extrae pdfjs de PDFs LaTeX) → marca combinante. */
const LOOSE_ACCENTS: Record<string, string> = {
  "´": "\u0301", // acento agudo
  "¨": "\u0308", // diéresis
};

function compose(_match: string, accent: string, letter: string): string {
  return ((letter === "ı" ? "i" : letter) + LOOSE_ACCENTS[accent]).normalize(
    "NFC",
  );
}

/**
 * Los PDFs hechos con LaTeX dibujan la tilde como un símbolo suelto antes de la
 * vocal, y pdfjs lo extrae así: «Matem´ aticas», «m´ ın», «Espa˜ na». Se
 * recomponen en «Matemáticas», «mín», «España». No toca ` ni ~ ni ^, que en
 * apuntes suelen ser código o matemáticas.
 */
export function fixLooseAccents(text: string): string {
  return (
    text
      // Solo las vocales que de verdad llevan cada acento en español: así un
      // apóstrofo o una comilla (don´t, ´hola´) no se pega a la letra siguiente.
      .replace(/([´])\s?([aeiouAEIOUı])/g, compose)
      .replace(/([¨])\s?([uUiI])/g, compose)
      .replace(/˜\s?([nN])/g, (_, letter: string) =>
        (letter + "\u0303").normalize("NFC"),
      )
  );
}

/** Caracteres de control (salvo tab y saltos de línea) y de uso privado. */
const JUNK_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uE000-\uF8FF]/g;

/**
 * Limpia el texto extraído de una página: une palabras cortadas con guion a
 * final de línea, recompone tildes sueltas, quita caracteres de control y de
 * uso privado (restos de símbolos matemáticos) y colapsa espacios.
 */
export function normalizePageText(raw: string): string {
  const joined = raw.replace(/([\p{L}])-\s*\n\s*([\p{Ll}])/gu, "$1$2");
  return fixLooseAccents(joined)
    .replace(JUNK_CHARS, " ")
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
  const { maxWords, overlapWords, minWords, minTailWords } = {
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
      const end = start + maxWords;
      const tail = words.length - end;
      // Un resto diminuto (casi todo solape) se absorbe en este fragmento.
      const absorbTail = tail > 0 && tail < minTailWords;
      const slice = words.slice(start, absorbTail ? words.length : end);
      chunks.push({ page, index: chunks.length, text: slice.join(" ") });
      if (tail <= 0 || absorbTail) break;
    }
  }

  return chunks;
}
