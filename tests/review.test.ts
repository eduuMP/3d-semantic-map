import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { AppDb, discardCard, recordReview } from "@/lib/db";
import {
  applyAnswer,
  failRate,
  orderForReview,
  summarizeSession,
} from "@/lib/review";

const card = (id: number, correct = 0, wrong = 0) => ({ id, correct, wrong });

describe("failRate", () => {
  it("vale 0 sin repasos", () => {
    expect(failRate(card(1))).toBe(0);
  });
  it("es la proporción de fallos", () => {
    expect(failRate(card(1, 3, 1))).toBe(0.25);
    expect(failRate(card(1, 0, 2))).toBe(1);
  });
});

describe("orderForReview", () => {
  it("devuelve lista vacía sin tarjetas", () => {
    expect(orderForReview([])).toEqual([]);
  });

  it("con una sola tarjeta la devuelve", () => {
    expect(orderForReview([card(7, 2, 0)]).map((c) => c.id)).toEqual([7]);
  });

  it("pone primero las de mayor tasa de fallo", () => {
    const order = orderForReview([card(1, 5, 0), card(2, 1, 3), card(3, 2, 2)]);
    expect(order.map((c) => c.id)).toEqual([2, 3, 1]);
  });

  it("a igual tasa, antes la que tiene más fallos", () => {
    const order = orderForReview([card(1, 1, 1), card(2, 3, 3)]);
    expect(order.map((c) => c.id)).toEqual([2, 1]);
  });

  it("las nunca repasadas van antes que las acertadas", () => {
    const order = orderForReview([card(1, 4, 0), card(2, 0, 0)]);
    expect(order.map((c) => c.id)).toEqual([2, 1]);
  });

  it("es estable: empata por id", () => {
    const order = orderForReview([card(3), card(1), card(2)]);
    expect(order.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("no modifica el array original", () => {
    const input = [card(2, 0, 1), card(1, 1, 0)];
    orderForReview(input);
    expect(input.map((c) => c.id)).toEqual([2, 1]);
  });
});

describe("applyAnswer", () => {
  it("suma un acierto", () => {
    expect(applyAnswer(card(1, 2, 1), true, 100)).toEqual({
      correct: 3,
      wrong: 1,
      lastReviewed: 100,
    });
  });
  it("suma un fallo", () => {
    expect(applyAnswer(card(1, 2, 1), false, 100)).toEqual({
      correct: 2,
      wrong: 2,
      lastReviewed: 100,
    });
  });
});

describe("summarizeSession", () => {
  it("cuenta aciertos y fallos", () => {
    expect(summarizeSession([true, false, true])).toEqual({
      total: 3,
      known: 2,
      missed: 1,
    });
  });
  it("sesión vacía", () => {
    expect(summarizeSession([])).toEqual({ total: 0, known: 0, missed: 0 });
  });
});

let counter = 0;
const open: Dexie[] = [];
afterEach(async () => {
  for (const database of open.splice(0)) {
    database.close();
    await Dexie.delete(database.name);
  }
});

async function freshDb() {
  const database = new AppDb(`review-db-${counter++}`);
  open.push(database);
  await database.open();
  return database;
}

const newCard = (chunkId: number) => ({
  topicId: 1,
  chunkId,
  question: "¿Q?",
  answer: "R",
  correct: 0,
  wrong: 0,
});

describe("recordReview / discardCard", () => {
  it("guarda aciertos, fallos y la fecha", async () => {
    const database = await freshDb();
    const id = (await database.cards.add(newCard(1) as never)) as number;
    expect(await recordReview(id, true, 50, database)).toBe(true);
    expect(await recordReview(id, false, 60, database)).toBe(true);
    const saved = await database.cards.get(id);
    expect(saved).toMatchObject({ correct: 1, wrong: 1, lastReviewed: 60 });
  });

  it("devuelve false si la tarjeta ya no existe", async () => {
    const database = await freshDb();
    expect(await recordReview(999, true, 1, database)).toBe(false);
  });

  it("descartar borra solo esa tarjeta", async () => {
    const database = await freshDb();
    const a = (await database.cards.add(newCard(1) as never)) as number;
    const b = (await database.cards.add(newCard(2) as never)) as number;
    await discardCard(a, database);
    expect(await database.cards.get(a)).toBeUndefined();
    expect(await database.cards.get(b)).toBeDefined();
  });
});
