import { describe, expect, it } from "vitest";
import {
  NO_DATA_COLOR,
  chunkMastery,
  groupMastery,
  masteryColor,
  masteryHover,
  percent,
  rateOf,
} from "@/lib/mastery";

const card = (chunkId: number, correct = 0, wrong = 0) => ({
  chunkId,
  correct,
  wrong,
});

describe("rateOf", () => {
  it("es null sin repasos", () => {
    expect(rateOf(0, 0)).toBeNull();
  });
  it("es aciertos entre repasos", () => {
    expect(rateOf(3, 1)).toBe(0.75);
    expect(rateOf(0, 4)).toBe(0);
    expect(rateOf(2, 0)).toBe(1);
  });
});

describe("chunkMastery", () => {
  it("sin tarjetas devuelve un mapa vacío", () => {
    expect(chunkMastery([]).size).toBe(0);
  });

  it("suma las tarjetas de un mismo fragmento", () => {
    const m = chunkMastery([card(1, 2, 0), card(1, 0, 2), card(2, 1, 0)]);
    expect(m.get(1)).toEqual({ correct: 2, wrong: 2, cards: 2, rate: 0.5 });
    expect(m.get(2)).toEqual({ correct: 1, wrong: 0, cards: 1, rate: 1 });
  });

  it("una tarjeta sin repasar cuenta como tarjeta pero no da dominio", () => {
    const m = chunkMastery([card(1)]);
    expect(m.get(1)).toEqual({ correct: 0, wrong: 0, cards: 1, rate: null });
  });

  it("un fragmento sin tarjetas no aparece", () => {
    expect(chunkMastery([card(1, 1, 0)]).has(9)).toBe(false);
  });
});

describe("groupMastery", () => {
  const byChunk = chunkMastery([card(1, 3, 1), card(2, 0, 2), card(3)]);

  it("suma los fragmentos del grupo", () => {
    expect(groupMastery([1, 2], byChunk)).toEqual({
      correct: 3,
      wrong: 3,
      cards: 2,
      rate: 0.5,
    });
  });

  it("ignora fragmentos sin tarjetas", () => {
    expect(groupMastery([1, 99], byChunk).rate).toBe(0.75);
  });

  it("un tema sin datos tiene dominio null", () => {
    expect(groupMastery([3], byChunk).rate).toBeNull();
    expect(groupMastery([], byChunk).rate).toBeNull();
    expect(groupMastery([99], byChunk).cards).toBe(0);
  });
});

describe("masteryColor", () => {
  it("es gris sin datos", () => {
    expect(masteryColor(null)).toBe(NO_DATA_COLOR);
    expect(masteryColor(Number.NaN)).toBe(NO_DATA_COLOR);
  });

  it("los extremos son rojo y verde", () => {
    expect(masteryColor(0)).toBe("#dc2626");
    expect(masteryColor(1)).toBe("#16a34a");
  });

  it("el punto medio es ámbar", () => {
    expect(masteryColor(0.5)).toBe("#eab308");
  });

  it("recorta los valores fuera de rango", () => {
    expect(masteryColor(-3)).toBe(masteryColor(0));
    expect(masteryColor(7)).toBe(masteryColor(1));
  });

  it("interpola entre las paradas y siempre devuelve un hex válido", () => {
    for (const rate of [0.1, 0.25, 0.33, 0.6, 0.75, 0.99]) {
      expect(masteryColor(rate)).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(masteryColor(0.25)).not.toBe(masteryColor(0));
    expect(masteryColor(0.25)).not.toBe(masteryColor(0.5));
  });
});

describe("textos", () => {
  it("percent redondea", () => {
    expect(percent(0.666)).toBe("67 %");
    expect(percent(1)).toBe("100 %");
  });

  it("hover sin datos", () => {
    expect(masteryHover(undefined)).toBe("Sin repasar todavía");
    expect(masteryHover({ correct: 0, wrong: 0, cards: 1, rate: null })).toBe(
      "Sin repasar todavía",
    );
  });

  it("hover con datos y singular/plural", () => {
    expect(masteryHover({ correct: 1, wrong: 0, cards: 1, rate: 1 })).toBe(
      "Dominio 100 % (1 repaso)",
    );
    expect(masteryHover({ correct: 2, wrong: 1, cards: 2, rate: 2 / 3 })).toBe(
      "Dominio 67 % (3 repasos)",
    );
  });
});
