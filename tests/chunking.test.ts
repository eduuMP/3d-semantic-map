import { describe, expect, it } from "vitest";
import { chunkPages, normalizePageText } from "@/lib/chunking";

const words = (n: number, prefix = "w") =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");

describe("normalizePageText", () => {
  it("colapsa espacios y saltos de línea", () => {
    expect(normalizePageText("  hola \n\n  mundo\t!  ")).toBe("hola mundo !");
  });

  it("une palabras cortadas con guion a final de línea", () => {
    expect(normalizePageText("la infor-\nmación es útil")).toBe(
      "la información es útil",
    );
  });

  it("no une guiones legítimos seguidos de mayúscula o número", () => {
    expect(normalizePageText("Madrid-\nBarcelona")).toBe("Madrid- Barcelona");
    expect(normalizePageText("fase 1-\n2")).toBe("fase 1- 2");
  });

  it("conserva tildes y ñ", () => {
    expect(normalizePageText("año  pequeño\ncanción")).toBe(
      "año pequeño canción",
    );
  });
});

describe("chunkPages", () => {
  it("devuelve [] sin páginas", () => {
    expect(chunkPages([])).toEqual([]);
  });

  it("descarta páginas vacías o casi vacías", () => {
    const out = chunkPages([
      { page: 1, text: "   \n  " },
      { page: 2, text: "12" },
      { page: 3, text: words(20) },
    ]);
    expect(out.map((c) => c.page)).toEqual([3]);
  });

  it("una página corta da un solo fragmento", () => {
    const out = chunkPages([{ page: 4, text: words(100) }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ page: 4, index: 0 });
  });

  it("trocea una página larga con el solape pedido", () => {
    const out = chunkPages([{ page: 1, text: words(100) }], {
      maxWords: 40,
      overlapWords: 10,
    });
    expect(out.length).toBeGreaterThan(1);
    const first = out[0].text.split(" ");
    const second = out[1].text.split(" ");
    expect(first).toHaveLength(40);
    expect(second.slice(0, 10)).toEqual(first.slice(-10));
  });

  it("cubre todo el texto sin dejar palabras fuera", () => {
    const out = chunkPages([{ page: 1, text: words(95) }], {
      maxWords: 40,
      overlapWords: 10,
    });
    expect(out.at(-1)!.text.split(" ").at(-1)).toBe("w94");
  });

  it("no crea un fragmento extra cuando el texto cabe justo", () => {
    const out = chunkPages([{ page: 1, text: words(40) }], {
      maxWords: 40,
      overlapWords: 10,
    });
    expect(out).toHaveLength(1);
  });

  it("nunca mezcla páginas y numera los fragmentos de forma global", () => {
    const out = chunkPages(
      [
        { page: 1, text: words(60, "a") },
        { page: 2, text: words(60, "b") },
      ],
      { maxWords: 40, overlapWords: 10 },
    );
    for (const c of out) {
      const prefix = c.page === 1 ? "a" : "b";
      expect(c.text.split(" ").every((w) => w.startsWith(prefix))).toBe(true);
    }
    expect(out.map((c) => c.index)).toEqual(out.map((_, i) => i));
  });

  it("lanza error si el solape no es menor que el máximo", () => {
    expect(() =>
      chunkPages([{ page: 1, text: words(50) }], {
        maxWords: 10,
        overlapWords: 10,
      }),
    ).toThrow();
  });
});
