import { describe, expect, it } from "vitest";
import {
  buildContext,
  checkCitations,
  cosine,
  extractCitations,
  NOT_FOUND_TEXT,
  parseAnswer,
  topK,
  type Candidate,
} from "@/lib/retrieval";
import { QuestionSchema } from "@/lib/schemas";

const cand = (
  id: number,
  vector: number[] | undefined,
  page = id,
  text = `texto ${id}`,
): Candidate => ({ id, page, documentName: "Apuntes", text, vector });

describe("cosine", () => {
  it("1 con vectores iguales, 0 ortogonales, -1 opuestos", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
  });
  it("no depende de la norma", () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  });
  it("devuelve 0 con vectores vacíos, de otro tamaño o de norma 0", () => {
    expect(cosine([], [])).toBe(0);
    expect(cosine([1, 2], [1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
  it("acepta Float32Array", () => {
    expect(
      cosine(new Float32Array([1, 0]), new Float32Array([1, 0])),
    ).toBeCloseTo(1);
  });
});

describe("topK", () => {
  const query = [1, 0];
  it("ordena por similitud y corta en k", () => {
    const out = topK(
      query,
      [cand(1, [0, 1]), cand(2, [1, 0]), cand(3, [1, 1]), cand(4, [-1, 0])],
      2,
    );
    expect(out.map((c) => c.id)).toEqual([2, 3]);
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });
  it("k mayor que el número de candidatos devuelve todos", () => {
    expect(topK(query, [cand(1, [1, 0]), cand(2, [0, 1])], 10)).toHaveLength(2);
  });
  it("ignora los fragmentos sin vector o con vector vacío", () => {
    const out = topK(
      query,
      [cand(1, undefined), cand(2, []), cand(3, [1, 0])],
      5,
    );
    expect(out.map((c) => c.id)).toEqual([3]);
  });
  it("k <= 0 o sin candidatos da []", () => {
    expect(topK(query, [cand(1, [1, 0])], 0)).toEqual([]);
    expect(topK(query, [], 3)).toEqual([]);
  });
  it("los empates se resuelven por id", () => {
    const out = topK(
      query,
      [cand(7, [1, 0]), cand(3, [1, 0]), cand(5, [1, 0])],
      3,
    );
    expect(out.map((c) => c.id)).toEqual([3, 5, 7]);
  });
  it("solo considera los candidatos que se le pasan (un tema)", () => {
    const tema = [cand(1, [0.2, 1]), cand(2, [0.1, 1])];
    const out = topK(query, tema, 4);
    expect(out.every((c) => [1, 2].includes(c.id))).toBe(true);
  });
});

describe("buildContext", () => {
  it("etiqueta cada fuente con su página", () => {
    const { context, used } = buildContext([
      cand(1, [1], 3, "uno"),
      cand(2, [1], 8, "dos"),
    ]);
    expect(context).toContain("[p. 3] (Apuntes)\nuno");
    expect(context).toContain("[p. 8] (Apuntes)\ndos");
    expect(used.map((u) => u.id)).toEqual([1, 2]);
  });
  it("normaliza espacios y saltos de línea", () => {
    const { context } = buildContext([cand(1, [1], 1, "a\n\n  b   c")]);
    expect(context).toContain("a b c");
  });
  it("deja fuera las fuentes que no caben enteras", () => {
    const big = "x".repeat(400);
    const { used } = buildContext(
      [cand(1, [1], 1, big), cand(2, [1], 2, big), cand(3, [1], 3, big)],
      900,
    );
    expect(used.map((u) => u.id)).toEqual([1, 2]);
  });
  it("la primera fuente siempre entra, recortada si hace falta", () => {
    const { context, used } = buildContext(
      [cand(1, [1], 1, "y".repeat(5000))],
      300,
    );
    expect(used).toHaveLength(1);
    expect(context.length).toBeLessThanOrEqual(310);
    expect(context.endsWith("…")).toBe(true);
  });
  it("sin fuentes da contexto vacío", () => {
    expect(buildContext([])).toEqual({ context: "", used: [] });
  });
  it("salta fuentes sin texto", () => {
    const { used } = buildContext([
      cand(1, [1], 1, "   "),
      cand(2, [1], 2, "hola"),
    ]);
    expect(used.map((u) => u.id)).toEqual([2]);
  });
});

describe("extractCitations", () => {
  it("[p. 3]", () => expect(extractCitations("Es así [p. 3].")).toEqual([3]));
  it("varias en corchetes separados, sin repetir y ordenadas", () => {
    expect(extractCitations("A [p. 8] y B [p. 3] y C [p. 8]")).toEqual([3, 8]);
  });
  it("lista dentro de un corchete", () => {
    expect(extractCitations("Ver [p. 3, 5]")).toEqual([3, 5]);
    expect(extractCitations("Ver [p. 3 y 5]")).toEqual([3, 5]);
  });
  it("rangos con pp.", () => {
    expect(extractCitations("Ver [pp. 3-5]")).toEqual([3, 4, 5]);
  });
  it("tolera mayúsculas y p sin punto", () => {
    expect(extractCitations("[P. 12] [p 7]")).toEqual([7, 12]);
  });
  it("un rango desmesurado solo cuenta sus extremos", () => {
    expect(extractCitations("[pp. 1-900]")).toEqual([1, 900]);
  });
  it("no confunde otros corchetes ni texto sin citas", () => {
    expect(extractCitations("Según [1] y [nota 3], sin citas")).toEqual([]);
    expect(extractCitations("")).toEqual([]);
  });
});

describe("checkCitations", () => {
  it("separa las verificadas de las inventadas", () => {
    expect(checkCitations("A [p. 3] y B [p. 99]", [3, 4])).toEqual({
      cited: [3, 99],
      unverified: [99],
    });
  });
  it("sin citas no hay nada sin verificar", () => {
    expect(checkCitations("sin citas", [1])).toEqual({
      cited: [],
      unverified: [],
    });
  });
});

describe("parseAnswer", () => {
  it("devuelve texto, citas y no verificadas", () => {
    const out = parseAnswer("  Respuesta [p. 2] y [p. 40].  ", [2, 3])!;
    expect(out.text).toBe("Respuesta [p. 2] y [p. 40].");
    expect(out.cited).toEqual([2, 40]);
    expect(out.unverified).toEqual([40]);
    expect(out.notFound).toBe(false);
  });
  it("detecta «No aparece en tus apuntes»", () => {
    expect(parseAnswer(NOT_FOUND_TEXT, [1])!.notFound).toBe(true);
    expect(parseAnswer("no aparece en tus apuntes", [1])!.notFound).toBe(true);
  });
  it("rechaza respuestas vacías o desmesuradas", () => {
    expect(parseAnswer("   ", [1])).toBeNull();
    expect(parseAnswer("x".repeat(7000), [1])).toBeNull();
  });
});

describe("QuestionSchema", () => {
  it("recorta y acepta preguntas normales", () => {
    expect(QuestionSchema.parse("  ¿Qué es un grafo?  ")).toBe(
      "¿Qué es un grafo?",
    );
  });
  it("rechaza preguntas vacías, de 1-2 letras o larguísimas", () => {
    expect(QuestionSchema.safeParse("  ").success).toBe(false);
    expect(QuestionSchema.safeParse("ab").success).toBe(false);
    expect(QuestionSchema.safeParse("a".repeat(501)).success).toBe(false);
  });
});
