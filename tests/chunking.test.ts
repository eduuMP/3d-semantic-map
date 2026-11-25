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

describe("fixLooseAccents / normalizePageText con PDFs LaTeX", () => {
  it("recompone la tilde suelta antes de la vocal", () => {
    expect(normalizePageText("Grado en Matem´ aticas")).toBe(
      "Grado en Matemáticas",
    );
    expect(normalizePageText("Matem´aticas")).toBe("Matemáticas");
  });

  it("recompone la i sin punto con acento", () => {
    expect(normalizePageText("el m´ ın( n, m ) + 2")).toBe(
      "el mín( n, m ) + 2",
    );
  });

  it("recompone la ñ y la diéresis", () => {
    expect(normalizePageText("Espa˜ na y ping¨ uino")).toBe(
      "España y pingüino",
    );
    expect(normalizePageText("Espa˜na")).toBe("España");
  });

  it("recompone mayúsculas", () => {
    expect(normalizePageText("´ Algebra e ´ Indice")).toBe("Álgebra e Índice");
  });

  it("no toca ~, ^ ni comillas invertidas (código y matemáticas)", () => {
    const text = "nivel ~1000 y x^2 con `for` y a~b";
    expect(normalizePageText(text)).toBe(text);
  });

  it("no pega apóstrofos ni comillas a la letra siguiente", () => {
    expect(normalizePageText("don´t")).toBe("don´t");
    expect(normalizePageText("dijo ´hola´ y")).toBe("dijo ´hola´ y");
    expect(normalizePageText("el ´ gato")).toBe("el ´ gato");
  });

  it("un acento que no va seguido de letra se deja como está", () => {
    expect(normalizePageText("f´ (x) = 2")).toBe("f´ (x) = 2");
  });

  it("no cambia el texto que ya tiene tildes bien", () => {
    expect(normalizePageText("Representación del Conocimiento")).toBe(
      "Representación del Conocimiento",
    );
  });

  it("quita caracteres de control y de uso privado", () => {
    expect(normalizePageText("f ( n ) = \u001a 0 si \ue001 x")).toBe(
      "f ( n ) = 0 si x",
    );
  });
});

describe("chunkPages", () => {
  it("devuelve [] sin páginas", () => {
    expect(chunkPages([])).toEqual([]);
  });

  it("conserva páginas cortas de diapositiva (~10 palabras)", () => {
    const out = chunkPages([{ page: 7, text: words(10) }]);
    expect(out).toHaveLength(1);
    expect(out[0].page).toBe(7);
  });

  it("absorbe un resto diminuto en el último fragmento en vez de crear uno casi duplicado", () => {
    const out = chunkPages([{ page: 1, text: words(351) }]);
    expect(out).toHaveLength(1);
    expect(out[0].text.split(" ")).toHaveLength(351);
  });

  it("crea un segundo fragmento cuando el resto es significativo", () => {
    const out = chunkPages([{ page: 1, text: words(400) }]);
    expect(out).toHaveLength(2);
    expect(out[1].text.split(" ").at(-1)).toBe("w399");
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

  it("numera desde 0 en cada llamada (el índice es por documento)", () => {
    const doc = [{ page: 1, text: words(60) }];
    const a = chunkPages(doc, { maxWords: 40, overlapWords: 10 });
    const b = chunkPages(doc, { maxWords: 40, overlapWords: 10 });
    expect(a[0].index).toBe(0);
    expect(b[0].index).toBe(0);
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
