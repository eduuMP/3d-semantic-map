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

/** Versión del algoritmo de troceado: se guarda en cada documento (ver `DocumentRecord`). */
export const CHUNKER_VERSION = 2;

/** Abreviaturas (sin el punto final, en minúsculas) tras las que no acaba la frase. */
const ABBREVIATIONS = new Set([
  "p",
  "pp",
  "pág",
  "págs",
  "fig",
  "figs",
  "cap",
  "caps",
  "sec",
  "secc",
  "ej",
  "eq",
  "eqs",
  "vol",
  "núm",
  "num",
  "no",
  "tel",
  "dr",
  "dra",
  "sr",
  "sra",
  "srta",
  "prof",
  "ud",
  "uds",
  "vs",
  "aprox",
  "cf",
  "ed",
  "eds",
  "apdo",
  "art",
  "arts",
  "esp",
  "etc",
  "ca",
  "máx",
  "mín",
  "min",
  "máx",
]);

const OPENERS = /^["“«'(\[¿¡]*[\p{Lu}\d]/u;
const CLOSERS = /["”»')\]]+$/;

function endsSentence(
  token: string,
  next: string | undefined,
  startsSentence: boolean,
): boolean {
  if (next === undefined) return false;
  const bare = token.replace(CLOSERS, "");
  const last = bare.at(-1);
  if (!last || !".!?…".includes(last)) return false;
  if (!OPENERS.test(next)) return false;
  if (last !== ".") return true;
  const word = bare.slice(0, -1).toLowerCase();
  // «p.», «J.» (una letra), «3.» / «1.2.» (listas numeradas) y las abreviaturas.
  if (/^\p{L}$/u.test(word)) return false;
  // Un número con punto solo es de lista si abre la frase («1. Intro»), no en «pág. 12.».
  if (startsSentence && /^[\d.]+$/.test(word)) return false;
  // «p. ej.»: el último segmento tras un punto interno también cuenta.
  const lastSegment = word.split(".").at(-1) ?? word;
  if (ABBREVIATIONS.has(word) || ABBREVIATIONS.has(lastSegment)) {
    // «etc.» con mayúscula detrás sí suele cerrar la frase.
    return word === "etc";
  }
  return true;
}

/**
 * Parte un texto ya normalizado (espacios simples) en frases. No corta en
 * abreviaturas («p. ej.», «Fig. 3»), iniciales, listas numeradas («1. Intro»)
 * ni decimales («3.5»). Un texto sin puntuación es una sola frase.
 */
export function splitSentences(text: string): string[] {
  const tokens = text.split(" ").filter(Boolean);
  const sentences: string[] = [];
  let current: string[] = [];
  tokens.forEach((token, i) => {
    current.push(token);
    if (endsSentence(token, tokens[i + 1], current.length === 1)) {
      sentences.push(current.join(" "));
      current = [];
    }
  });
  if (current.length) sentences.push(current.join(" "));
  return sentences;
}

type Resolved = Required<ChunkOptions>;

/** Troceado por palabras con solape (texto sin frases reconocibles). */
function chunkByWords(words: string[], o: Resolved): string[] {
  const step = o.maxWords - o.overlapWords;
  const out: string[] = [];
  for (let start = 0; start < words.length; start += step) {
    const end = start + o.maxWords;
    const tail = words.length - end;
    // Un resto diminuto (casi todo solape) se absorbe en este fragmento.
    const absorbTail = tail > 0 && tail < o.minTailWords;
    out.push(words.slice(start, absorbTail ? words.length : end).join(" "));
    if (tail <= 0 || absorbTail) break;
  }
  return out;
}

/**
 * Troceado por frases: se suman frases hasta el tope y se corta en el final de
 * una. El solape son las últimas frases que caben en `overlapWords`. Una frase
 * más larga que el tope se parte por palabras.
 */
function chunkBySentences(sentences: string[], o: Resolved): string[] {
  const units: string[][] = [];
  for (const sentence of sentences) {
    const w = sentence.split(" ");
    for (let i = 0; i < w.length; i += o.maxWords) {
      units.push(w.slice(i, i + o.maxWords));
    }
  }

  const out: string[] = [];
  let i = 0;
  while (i < units.length) {
    let j = i;
    let count = 0;
    while (j < units.length && count + units[j].length <= o.maxWords) {
      count += units[j].length;
      j++;
    }
    const body = units.slice(i, j).flat();
    const rest = units.slice(j).reduce((n, u) => n + u.length, 0);
    if (rest === 0) {
      out.push(body.join(" "));
      break;
    }
    if (rest < o.minTailWords) {
      out.push([...body, ...units.slice(j).flat()].join(" "));
      break;
    }
    out.push(body.join(" "));
    // Solape: retrocede mientras las últimas frases quepan en overlapWords.
    let k = j;
    let overlap = 0;
    while (k - 1 > i && overlap + units[k - 1].length <= o.overlapWords) {
      k--;
      overlap += units[k].length;
    }
    i = k;
  }
  return out;
}

/**
 * Trocea el texto por página. Los fragmentos nunca cruzan páginas, así la
 * cita `[p. X]` siempre es exacta, y una página que cabe en el tope (una
 * diapositiva) es un único fragmento. En páginas largas se corta al final de
 * una frase. `index` es el orden global del fragmento.
 */
export function chunkPages(
  pages: PageText[],
  options: ChunkOptions = {},
): Chunk[] {
  const resolved: Resolved = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  const { maxWords, overlapWords, minWords, minTailWords } = resolved;
  if (maxWords <= 0) throw new Error("maxWords debe ser mayor que 0");
  if (overlapWords < 0 || overlapWords >= maxWords) {
    throw new Error("overlapWords debe estar entre 0 y maxWords - 1");
  }

  const chunks: Chunk[] = [];
  for (const { page, text } of pages) {
    const normalized = normalizePageText(text);
    const words = normalized.split(" ").filter(Boolean);
    if (words.length === 0 || words.length < minWords) continue;

    let pieces: string[];
    if (words.length <= maxWords + minTailWords - 1) {
      // Cabe (con el resto diminuto absorbido): un solo fragmento.
      pieces = [words.join(" ")];
    } else {
      const sentences = splitSentences(normalized);
      pieces =
        sentences.length > 1
          ? chunkBySentences(sentences, resolved)
          : chunkByWords(words, resolved);
    }
    for (const piece of pieces) {
      chunks.push({ page, index: chunks.length, text: piece });
    }
  }
  return chunks;
}
