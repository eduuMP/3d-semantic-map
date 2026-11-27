import { CardSchema } from "./schemas";

export const DEFAULT_CARD_COUNT = 5;
export const MAX_CARD_COUNT = 10;
export const FRAGMENT_CARD_COUNT = 3;
/** Intentos por tarjeta: el primero y dos reintentos. */
export const MAX_ATTEMPTS = 3;
export const MAX_CHARS_PER_FRAGMENT = 1500;
/** Preguntas del mismo fragmento que se pasan al prompt para no repetirlas. */
export const MAX_AVOID = 5;

export type CardDraft = { question: string; answer: string };
export type NewCard = CardDraft & { chunkId: number };

/**
 * La pregunta depende de tener el apunte delante: habla del texto («en los
 * apuntes», «el fragmento», «página 3») o de apartados sueltos como «(a)-(c)».
 * Un `(n)` pegado a una letra (`f(n)`) es matemática y no cuenta.
 */
export function refersToSource(question: string): boolean {
  return (
    /\b(fragmento|apuntes|documento|texto|seg[uú]n|p[aá]gina|diapositiva|ejercicio \d|figura \d|tabla \d)\b/i.test(
      question,
    ) || /(^|\s)\(\s*[a-z0-9]{1,2}\s*\)/i.test(question)
  );
}

/**
 * Extrae `{pregunta, respuesta}` de la salida del LLM (tolera texto o ```
 * alrededor), la valida con zod y descarta preguntas que hablan del propio
 * texto («según el fragmento…»). Devuelve null si no sirve.
 */
export function parseCard(raw: string): CardDraft | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = CardSchema.safeParse(json);
  if (!parsed.success) return null;
  const { pregunta, respuesta } = parsed.data;
  if (refersToSource(pregunta)) return null;
  return { question: pregunta, answer: respuesta };
}

/** Pregunta sin tildes, mayúsculas ni signos, para comparar. */
export function normalizeQuestion(question: string): string {
  return question
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** «¿Qué es X?», «¿Qué son las X?», «Define X»: pregunta de definición pura. */
export function isDefinitional(question: string): boolean {
  return /^(que (es|son|significa|significan)|define|definir|cual es (la )?definicion)\b/.test(
    normalizeQuestion(question),
  );
}

/** Palabras de relleno de las preguntas: no distinguen una de otra. */
const FILLER = new Set([
  "que",
  "es",
  "son",
  "un",
  "una",
  "unos",
  "unas",
  "el",
  "la",
  "los",
  "las",
  "de",
  "del",
  "en",
  "se",
  "y",
  "o",
  "a",
  "por",
  "para",
  "como",
  "cual",
  "cuales",
  "significa",
  "define",
  "definir",
]);

/** Quita el plural más habitual para que «funciones» y «función» coincidan. */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function keywords(question: string): Set<string> {
  return new Set(
    normalizeQuestion(question)
      .split(" ")
      .filter((w) => w && !FILLER.has(w))
      .map(stem),
  );
}

/** Dos preguntas con ≥ 70 % de palabras clave en común cuentan como la misma. */
export const SIMILARITY_THRESHOLD = 0.7;

export function isDuplicate(
  question: string,
  existing: readonly string[],
): boolean {
  const key = normalizeQuestion(question);
  const words = keywords(question);
  return existing.some((other) => {
    if (normalizeQuestion(other) === key) return true;
    const otherWords = keywords(other);
    if (words.size === 0 || otherWords.size === 0) return false;
    let shared = 0;
    for (const w of words) if (otherWords.has(w)) shared++;
    return (
      shared / (words.size + otherWords.size - shared) >= SIMILARITY_THRESHOLD
    );
  });
}

type Located = { id: number; xyz?: readonly [number, number, number] };

function distance2(a: readonly number[], b: readonly number[]) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

/**
 * Reparte `n` tarjetas entre los fragmentos: primero los que aún no tienen
 * ninguna (los más cercanos al centroide, que son los más representativos) y,
 * si sobran, vuelve a empezar la lista. Devuelve un `chunkId` por tarjeta.
 */
export function planJobs(
  chunks: readonly Located[],
  n: number,
  withCards: ReadonlySet<number> = new Set(),
): number[] {
  const count = Math.min(Math.max(0, Math.floor(n)), MAX_CARD_COUNT);
  if (count === 0 || chunks.length === 0) return [];

  const located = chunks.filter((c) => c.xyz);
  const centroid = [0, 0, 0];
  for (const c of located) {
    for (let i = 0; i < 3; i++) centroid[i] += c.xyz![i] / located.length;
  }
  const rank = (c: Located) =>
    c.xyz ? distance2(c.xyz, centroid) : Number.POSITIVE_INFINITY;

  const ordered = [...chunks].sort((a, b) => {
    const fresh = Number(withCards.has(a.id)) - Number(withCards.has(b.id));
    return fresh || rank(a) - rank(b) || a.id - b.id;
  });
  return Array.from(
    { length: count },
    (_, i) => ordered[i % ordered.length].id,
  );
}

export type CardRunResult = {
  saved: number;
  /** Tarjetas sin conseguir tras agotar los intentos. */
  failed: number;
  /** Intentos descartados por inválidos o repetidos (incluye los reintentados). */
  discarded: number;
  cancelled: boolean;
};

/**
 * Ejecuta un trabajo por tarjeta. `generate` devuelve el texto crudo del LLM
 * (o null si falló). Las inválidas y las repetidas se descartan y solo ese
 * trabajo se reintenta. Cada tarjeta buena se entrega al momento con `onCard`
 * para que parar a mitad conserve lo ya hecho.
 */
export async function runCardJobs(options: {
  jobs: readonly number[];
  /** Preguntas ya guardadas por fragmento. */
  existing: ReadonlyMap<number, readonly string[]>;
  generate: (
    chunkId: number,
    avoid: readonly string[],
    attempt: number,
  ) => Promise<string | null>;
  onCard: (card: NewCard) => Promise<void> | void;
  onProgress?: (done: number, total: number, saved: number) => void;
  isCancelled?: () => boolean;
}): Promise<CardRunResult> {
  const { jobs, generate, onCard, onProgress, isCancelled } = options;
  const questions = new Map<number, string[]>();
  for (const [id, list] of options.existing) questions.set(id, [...list]);
  const all = () => [...questions.values()].flat();

  const result: CardRunResult = {
    saved: 0,
    failed: 0,
    discarded: 0,
    cancelled: false,
  };

  for (let i = 0; i < jobs.length; i++) {
    if (isCancelled?.()) {
      result.cancelled = true;
      break;
    }
    const chunkId = jobs[i];
    const own = questions.get(chunkId) ?? [];
    let card: CardDraft | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !card; attempt++) {
      if (isCancelled?.()) break;
      const raw = await generate(chunkId, own.slice(-MAX_AVOID), attempt);
      const parsed = raw === null ? null : parseCard(raw);
      // Las definiciones puras solo se admiten en el último intento, para que
      // un fragmento que solo define cosas no se quede sin tarjeta.
      const tooPlain =
        parsed !== null &&
        attempt < MAX_ATTEMPTS - 1 &&
        isDefinitional(parsed.question);
      if (parsed && !tooPlain && !isDuplicate(parsed.question, all()))
        card = parsed;
      else result.discarded++;
    }
    if (isCancelled?.() && !card) {
      result.cancelled = true;
      break;
    }
    if (card) {
      await onCard({ chunkId, ...card });
      questions.set(chunkId, [...own, card.question]);
      result.saved++;
    } else {
      result.failed++;
    }
    onProgress?.(i + 1, jobs.length, result.saved);
  }
  return result;
}
