import { AnswerTextSchema } from "./schemas";

export const DEFAULT_TOP_K = 4;
/** Presupuesto de contexto (~1500 tokens ≈ 5000 caracteres en español). */
export const DEFAULT_CONTEXT_CHARS = 5000;
export const NOT_FOUND_TEXT = "No aparece en tus apuntes.";

export type Candidate = {
  id: number;
  page: number;
  documentName: string;
  text: string;
  vector?: ArrayLike<number>;
};

export type Scored = Candidate & { score: number };

/** Similitud coseno. Vectores vacíos, de distinto tamaño o de norma 0 dan 0. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/**
 * Los `k` candidatos más parecidos a la pregunta. Ignora los que no tienen
 * vector. Los empates se desempatan por id para que el resultado sea estable.
 */
export function topK(
  query: ArrayLike<number>,
  candidates: readonly Candidate[],
  k = DEFAULT_TOP_K,
): Scored[] {
  if (k <= 0) return [];
  return candidates
    .filter((c) => c.vector && c.vector.length > 0)
    .map((c) => ({ ...c, score: cosine(query, c.vector!) }))
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, k);
}

/**
 * Texto de contexto para el LLM: cada fuente va precedida de su `[p. X]`.
 * Se incluyen fuentes enteras mientras quepan; la primera siempre entra
 * (recortada si hace falta). Devuelve también las fuentes realmente usadas.
 */
export function buildContext<T extends Candidate>(
  sources: readonly T[],
  maxChars = DEFAULT_CONTEXT_CHARS,
): { context: string; used: T[] } {
  const parts: string[] = [];
  const used: T[] = [];
  let total = 0;
  for (const source of sources) {
    const header = `[p. ${source.page}] (${source.documentName})\n`;
    const flat = source.text.replace(/\s+/g, " ").trim();
    const room = maxChars - total - header.length;
    if (used.length > 0 && flat.length > room) break;
    const body =
      flat.length > room && room > 0
        ? `${flat.slice(0, room).trimEnd()}…`
        : flat;
    if (!body) continue;
    parts.push(header + body);
    used.push(source);
    total += header.length + body.length + 2;
  }
  return { context: parts.join("\n\n"), used };
}

const MAX_RANGE = 20;

function pagesIn(inner: string): number[] {
  const pages: number[] = [];
  for (const match of inner.matchAll(/(\d+)\s*[-–]\s*(\d+)|(\d+)/g)) {
    if (match[3] !== undefined) {
      pages.push(Number(match[3]));
    } else {
      const from = Number(match[1]);
      const to = Number(match[2]);
      if (to >= from && to - from <= MAX_RANGE) {
        for (let p = from; p <= to; p++) pages.push(p);
      } else {
        pages.push(from, to);
      }
    }
  }
  return pages;
}

/** Páginas citadas con `[p. 3]`, `[p. 3, 5]`, `[p. 3 y 5]` o `[pp. 3-5]`, sin repetir y en orden. */
export function extractCitations(answer: string): number[] {
  const found: number[] = [];
  for (const match of answer.matchAll(/\[\s*pp?\.?\s*([^\]]*)\]/gi)) {
    found.push(...pagesIn(match[1]));
  }
  return [...new Set(found)].sort((a, b) => a - b);
}

export type CitationCheck = { cited: number[]; unverified: number[] };

/** Separa las páginas citadas que sí estaban entre las fuentes de las que no. */
export function checkCitations(
  answer: string,
  allowedPages: Iterable<number>,
): CitationCheck {
  const allowed = new Set(allowedPages);
  const cited = extractCitations(answer);
  return { cited, unverified: cited.filter((p) => !allowed.has(p)) };
}

export type ParsedAnswer = CitationCheck & { text: string; notFound: boolean };

/**
 * Valida la respuesta final con zod y comprueba sus citas. Devuelve null si el
 * texto es inválido (vacío o descontrolado).
 */
export function parseAnswer(
  raw: string,
  allowedPages: Iterable<number>,
): ParsedAnswer | null {
  const parsed = AnswerTextSchema.safeParse(raw);
  if (!parsed.success) return null;
  const text = parsed.data;
  return {
    text,
    notFound: /no aparece en tus apuntes/i.test(text),
    ...checkCitations(text, allowedPages),
  };
}
