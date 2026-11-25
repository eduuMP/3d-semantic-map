import { describe, expect, it } from "vitest";
import {
  aggregateDownloadProgress,
  escapeHtml,
  hasMap,
  hoverText,
  isMapStale,
  wrapText,
} from "@/lib/map-view";

describe("escapeHtml", () => {
  it("escapa los caracteres con significado en HTML", () => {
    expect(escapeHtml(`<b>"a" & b</b>`)).toBe(
      "&lt;b&gt;&quot;a&quot; &amp; b&lt;/b&gt;",
    );
  });
});

describe("wrapText", () => {
  it("parte por palabras sin pasar del ancho", () => {
    const lines = wrapText("uno dos tres cuatro cinco seis", 10);
    expect(lines.every((l) => l.length <= 10)).toBe(true);
    expect(lines.join(" ")).toBe("uno dos tres cuatro cinco seis");
  });

  it("no corta una palabra más larga que el ancho", () => {
    expect(wrapText("supercalifragilistico y ya", 5)).toEqual([
      "supercalifragilistico",
      "y ya",
    ]);
  });
});

describe("hoverText", () => {
  it("incluye documento, página y extracto", () => {
    const out = hoverText("La mitocondria produce ATP", 12, "bio.pdf");
    expect(out).toContain("<b>bio.pdf</b>");
    expect(out).toContain("p. 12");
    expect(out).toContain("mitocondria");
  });

  it("escapa el HTML que venga del PDF o del nombre del archivo", () => {
    const out = hoverText("<img src=x onerror=alert(1)>", 1, "<script>.pdf");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;img");
    expect(out).toContain("&lt;script&gt;.pdf");
  });

  it("recorta los extractos largos con puntos suspensivos", () => {
    const out = hoverText("palabra ".repeat(100), 1, "a.pdf");
    expect(out).toContain("…");
    expect(out.length).toBeLessThan(400);
  });
});

describe("hasMap / isMapStale", () => {
  const withXyz = { xyz: [0, 0, 0] };
  const without = {};

  it("sin fragmentos no hay mapa ni está desactualizado", () => {
    expect(hasMap([])).toBe(false);
    expect(isMapStale([])).toBe(false);
  });

  it("todos con coordenadas: hay mapa y está al día", () => {
    expect(hasMap([withXyz, withXyz])).toBe(true);
    expect(isMapStale([withXyz, withXyz])).toBe(false);
  });

  it("alguno sin coordenadas: desactualizado", () => {
    expect(isMapStale([withXyz, without])).toBe(true);
    expect(hasMap([withXyz, without])).toBe(true);
  });

  it("ninguno con coordenadas: sin mapa pero pendiente", () => {
    expect(hasMap([without])).toBe(false);
    expect(isMapStale([without])).toBe(true);
  });
});

describe("aggregateDownloadProgress", () => {
  it("suma los archivos del modelo", () => {
    expect(
      aggregateDownloadProgress({
        a: { loaded: 50, total: 100 },
        b: { loaded: 100, total: 100 },
      }),
    ).toEqual({ loaded: 150, total: 200, percent: 75 });
  });

  it("ignora archivos sin tamaño y no pasa del 100 %", () => {
    const out = aggregateDownloadProgress({
      a: { loaded: 120, total: 100 },
      b: { loaded: 5, total: 0 },
    });
    expect(out.percent).toBe(100);
  });

  it("sin archivos devuelve 0 %", () => {
    expect(aggregateDownloadProgress({}).percent).toBe(0);
  });
});
