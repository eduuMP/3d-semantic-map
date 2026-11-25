import { TopicNameSchema } from "./schemas";

export const MIN_REPRESENTATIVES = 3;
export const MAX_REPRESENTATIVES = 5;
export const MAX_CHARS_PER_FRAGMENT = 700;

type Xyz = readonly [number, number, number];
type Located = { id: number; xyz: Xyz; text: string };

function distance2(a: Xyz, b: Xyz) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

/**
 * Los fragmentos más cercanos al centroide del tema (entre 3 y 5, o todos si
 * hay menos), con el texto recortado para caber en el contexto del modelo.
 */
export function pickRepresentatives(
  chunks: readonly Located[],
  max = MAX_REPRESENTATIVES,
): string[] {
  const n = chunks.length;
  if (n === 0) return [];
  const centroid: [number, number, number] = [0, 0, 0];
  for (const c of chunks) {
    centroid[0] += c.xyz[0] / n;
    centroid[1] += c.xyz[1] / n;
    centroid[2] += c.xyz[2] / n;
  }
  const take = Math.min(Math.max(MIN_REPRESENTATIVES, Math.ceil(n / 4)), max);
  return [...chunks]
    .sort((a, b) => distance2(a.xyz, centroid) - distance2(b.xyz, centroid))
    .slice(0, take)
    .map((c) => {
      const flat = c.text.replace(/\s+/g, " ").trim();
      return flat.length > MAX_CHARS_PER_FRAGMENT
        ? `${flat.slice(0, MAX_CHARS_PER_FRAGMENT).trimEnd()}…`
        : flat;
    });
}

const EDGE_QUOTES_START = /^["“«'\s]+/;
const EDGE_QUOTES_END = /["”».'\s]+$/;

/**
 * Extrae `{nombre}` de la respuesta del LLM (tolera texto o ``` alrededor) y la
 * valida con zod. Devuelve null si no es válida.
 */
export function parseTopicName(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = TopicNameSchema.safeParse(json);
  if (!parsed.success) return null;
  const name = parsed.data.nombre
    .replace(EDGE_QUOTES_START, "")
    .replace(EDGE_QUOTES_END, "");
  return name.length >= 2 ? name : null;
}

/** Nombres repetidos → «Nombre (2)». Mantiene el orden. */
export function dedupeNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? name : `${name} (${count})`;
  });
}
