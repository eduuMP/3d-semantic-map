/** Lógica pura del dominio de cada fragmento y tema (H7). Sin base de datos ni Plotly. */

export type MasteryCard = {
  chunkId: number;
  correct: number;
  wrong: number;
};

export type Mastery = {
  correct: number;
  wrong: number;
  /** Tarjetas del fragmento (repasadas o no). */
  cards: number;
  /** Aciertos / (aciertos + fallos); null si todavía no se ha repasado nada. */
  rate: number | null;
};

export const NO_DATA_COLOR = "#9ca3af";

export function rateOf(correct: number, wrong: number): number | null {
  const total = correct + wrong;
  return total === 0 ? null : correct / total;
}

/** Dominio por fragmento, sumando los repasos de todas sus tarjetas. */
export function chunkMastery(cards: readonly MasteryCard[]) {
  const byChunk = new Map<number, Mastery>();
  for (const card of cards) {
    const prev = byChunk.get(card.chunkId) ?? {
      correct: 0,
      wrong: 0,
      cards: 0,
      rate: null,
    };
    const correct = prev.correct + card.correct;
    const wrong = prev.wrong + card.wrong;
    byChunk.set(card.chunkId, {
      correct,
      wrong,
      cards: prev.cards + 1,
      rate: rateOf(correct, wrong),
    });
  }
  return byChunk;
}

/** Dominio de un grupo de fragmentos (un tema): suma sus aciertos y fallos. */
export function groupMastery(
  chunkIds: readonly number[],
  byChunk: ReadonlyMap<number, Mastery>,
): Mastery {
  let correct = 0;
  let wrong = 0;
  let cards = 0;
  for (const id of chunkIds) {
    const m = byChunk.get(id);
    if (!m) continue;
    correct += m.correct;
    wrong += m.wrong;
    cards += m.cards;
  }
  return { correct, wrong, cards, rate: rateOf(correct, wrong) };
}

// Rojo → ámbar → verde. El ámbar en medio evita un gris sucio al interpolar.
const SCALE: [number, [number, number, number]][] = [
  [0, [220, 38, 38]],
  [0.5, [234, 179, 8]],
  [1, [22, 163, 74]],
];

const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");

/** Color de la escala para un dominio entre 0 y 1; gris si no hay datos. */
export function masteryColor(rate: number | null): string {
  if (rate === null || Number.isNaN(rate)) return NO_DATA_COLOR;
  const t = Math.min(1, Math.max(0, rate));
  const upper = SCALE.findIndex(([stop]) => t <= stop);
  const [t1, c1] = SCALE[upper];
  if (upper === 0) return `#${c1.map(hex).join("")}`;
  const [t0, c0] = SCALE[upper - 1];
  const k = (t - t0) / (t1 - t0);
  return `#${c0.map((v, i) => hex(v + (c1[i] - v) * k)).join("")}`;
}

export function percent(rate: number): string {
  return `${Math.round(rate * 100)} %`;
}

/** Línea de hover del dominio. Texto fijo, sin datos del PDF. */
export function masteryHover(m: Mastery | undefined): string {
  if (!m || m.rate === null) return "Sin repasar todavía";
  const n = m.correct + m.wrong;
  return `Dominio ${percent(m.rate)} (${n} ${n === 1 ? "repaso" : "repasos"})`;
}
