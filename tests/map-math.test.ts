import { describe, expect, it } from "vitest";
import {
  CORE_RADIUS,
  OUTLIER_FACTOR,
  chooseK,
  chooseNeighbors,
  clusterPoints,
  isValidEmbedding,
  layout3d,
  sameIdSet,
  normalizeCoords,
  seededRandom,
} from "@/lib/map-math";

function blobs(perBlob: number, centers: number[][], seed = 1) {
  const random = seededRandom(seed);
  const points: number[][] = [];
  const truth: number[] = [];
  centers.forEach((c, label) => {
    for (let i = 0; i < perBlob; i++) {
      points.push(c.map((x) => x + (random() - 0.5) * 0.4));
      truth.push(label);
    }
  });
  return { points, truth };
}

describe("chooseK", () => {
  it("devuelve 0 sin fragmentos", () => {
    expect(chooseK(0)).toBe(0);
  });

  it("nunca supera el número de fragmentos", () => {
    expect(chooseK(1)).toBe(1);
    expect(chooseK(2)).toBe(2);
    expect(chooseK(3)).toBe(3);
  });

  it("usa un mínimo de 3 y sigue √(n/2)", () => {
    expect(chooseK(10)).toBe(3);
    expect(chooseK(50)).toBe(5);
    expect(chooseK(200)).toBe(10);
  });

  it("no pasa de 12", () => {
    expect(chooseK(1634)).toBe(12);
    expect(chooseK(100000)).toBe(12);
  });
});

describe("chooseNeighbors", () => {
  it("siempre es menor que n y está entre 1 y 15", () => {
    for (const n of [2, 3, 5, 10, 100, 1634]) {
      const k = chooseNeighbors(n);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThan(n);
      expect(k).toBeLessThanOrEqual(15);
    }
  });
});

describe("isValidEmbedding", () => {
  it("acepta un vector normalizado", () => {
    expect(isValidEmbedding([0.6, 0.8])).toBe(true);
    expect(isValidEmbedding(new Float32Array([1, 0, 0]))).toBe(true);
  });

  it("rechaza vacíos, ceros, NaN e infinitos", () => {
    expect(isValidEmbedding([])).toBe(false);
    expect(isValidEmbedding([0, 0, 0])).toBe(false);
    expect(isValidEmbedding([NaN, 1])).toBe(false);
    expect(isValidEmbedding([Infinity, 0])).toBe(false);
  });

  it("rechaza vectores sin normalizar o basura (norma lejos de 1)", () => {
    expect(isValidEmbedding([3, 4])).toBe(false);
    expect(isValidEmbedding([15360, 15360])).toBe(false); // mitades fp16 leídas como enteros
    expect(isValidEmbedding([0.01, 0.01])).toBe(false);
  });
});

describe("sameIdSet", () => {
  it("es true con los mismos ids en cualquier orden", () => {
    expect(sameIdSet([1, 2, 3], [3, 1, 2])).toBe(true);
    expect(sameIdSet([], [])).toBe(true);
  });

  it("es false si se añadió, quitó o cambió algún id", () => {
    expect(sameIdSet([1, 2, 3], [1, 2])).toBe(false);
    expect(sameIdSet([1, 2], [1, 2, 3])).toBe(false);
    expect(sameIdSet([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it("no se deja engañar por ids repetidos", () => {
    expect(sameIdSet([1, 1, 2], [1, 2, 2])).toBe(false);
  });
});

describe("seededRandom", () => {
  it("misma semilla, misma secuencia", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("devuelve valores en [0, 1)", () => {
    const r = seededRandom(3);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("normalizeCoords", () => {
  it("devuelve [] sin puntos", () => {
    expect(normalizeCoords([])).toEqual([]);
  });

  it("centra en la mediana y deja los puntos dentro de la esfera acotada", () => {
    const pts = Array.from({ length: 20 }, (_, i) => [
      i * 3,
      i * 3 + 1,
      i * 3 + 2,
    ]);
    const out = normalizeCoords(pts);
    const limit = CORE_RADIUS * OUTLIER_FACTOR + 1e-9;
    for (const p of out) expect(Math.hypot(...p)).toBeLessThanOrEqual(limit);
    // La mediana de cada eje cae en 0.
    for (let d = 0; d < 3; d++) {
      const sorted = out.map((p) => p[d]).sort((a, b) => a - b);
      expect(
        Math.abs(sorted[Math.floor((sorted.length - 1) / 2)]),
      ).toBeLessThan(0.1);
    }
  });

  it("unos pocos atípicos no aplastan al resto en un punto", () => {
    // 26 puntos en un grupo apretado + 2 atípicos muy lejos (caso real visto).
    const random = seededRandom(3);
    const cluster = Array.from({ length: 26 }, () => [
      0.8 + (random() - 0.5) * 0.2,
      -0.8 + (random() - 0.5) * 0.2,
      0.5 + (random() - 0.5) * 0.2,
    ]);
    const out = normalizeCoords([
      ...cluster,
      [-0.9, 0.9, -0.6],
      [-0.85, 1, -0.5],
    ]);
    const grupo = out.slice(0, 26);
    const spread = Math.max(...grupo.map((p) => Math.hypot(...p)));
    expect(spread).toBeGreaterThan(0.3); // antes de la escala robusta quedaba en ~0.05
    for (const p of out) {
      expect(Math.hypot(...p)).toBeLessThanOrEqual(
        CORE_RADIUS * OUTLIER_FACTOR + 1e-9,
      );
    }
  });

  it("conserva la dirección de cada punto", () => {
    const out = normalizeCoords([
      [-10, 0, 0],
      [10, 0, 0],
      [0, 5, 0],
    ]);
    expect(out[0][0]).toBeLessThan(0);
    expect(out[1][0]).toBeGreaterThan(0);
    expect(out[2][1]).toBeGreaterThan(0);
  });

  it("si todos los puntos son iguales, devuelve ceros (sin NaN)", () => {
    expect(
      normalizeCoords([
        [2, 2, 2],
        [2, 2, 2],
      ]),
    ).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it("un solo punto vale cero", () => {
    expect(normalizeCoords([[4, 5, 6]])).toEqual([[0, 0, 0]]);
  });
});

describe("clusterPoints", () => {
  const centers = [
    [0, 0, 0],
    [10, 0, 0],
    [0, 10, 0],
  ];

  it("separa tres nubes y es determinista", () => {
    const { points, truth } = blobs(15, centers);
    const a = clusterPoints(points, 3);
    const b = clusterPoints(points, 3);
    expect(a).toEqual(b);
    // Cada nube cae entera en un único cluster y los tres son distintos.
    const labelOf = [0, 1, 2].map((blob) => {
      const labels = new Set(a.filter((_, i) => truth[i] === blob));
      expect(labels.size).toBe(1);
      return [...labels][0];
    });
    expect(new Set(labelOf).size).toBe(3);
  });

  it("con k = 1 o sin puntos no falla", () => {
    expect(clusterPoints([], 3)).toEqual([]);
    expect(
      clusterPoints(
        [
          [1, 1, 1],
          [2, 2, 2],
        ],
        1,
      ),
    ).toEqual([0, 0]);
  });

  it("con menos puntos que temas, cada punto es su propio tema", () => {
    expect(
      clusterPoints(
        [
          [0, 0, 0],
          [5, 5, 5],
        ],
        3,
      ),
    ).toEqual([0, 1]);
  });
});

describe("layout3d", () => {
  const vectors = blobs(
    15,
    [
      [0, 0, 0, 0, 0, 0],
      [8, 0, 0, 0, 0, 0],
      [0, 8, 0, 0, 0, 0],
    ],
    5,
  ).points;

  it("devuelve n puntos 3D finitos y acotados", async () => {
    const out = await layout3d(vectors);
    expect(out).toHaveLength(vectors.length);
    for (const p of out) {
      expect(p).toHaveLength(3);
      for (const v of p) {
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(
          CORE_RADIUS * OUTLIER_FACTOR + 1e-6,
        );
      }
    }
  });

  it("es reproducible con la misma semilla", async () => {
    expect(await layout3d(vectors, { seed: 9 })).toEqual(
      await layout3d(vectors, { seed: 9 }),
    );
  });

  it("con muy pocos puntos no falla y también devuelve 3D", async () => {
    expect(await layout3d([])).toEqual([]);
    const one = await layout3d([[1, 2, 3, 4]]);
    expect(one).toHaveLength(1);
    expect(one[0]).toHaveLength(3);
    const four = await layout3d([[1], [2], [3], [4]]);
    expect(four).toHaveLength(4);
  });
});
