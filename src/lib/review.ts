/** Lógica pura del repaso de tarjetas (H6). Sin LLM ni acceso a la base de datos. */

export type ReviewableCard = {
  id: number;
  correct: number;
  wrong: number;
  lastReviewed?: number;
};

/** Proporción de fallos entre los repasos hechos. Una tarjeta nunca repasada vale 0. */
export function failRate(card: Pick<ReviewableCard, "correct" | "wrong">) {
  const total = card.correct + card.wrong;
  return total === 0 ? 0 : card.wrong / total;
}

/**
 * Orden de repaso: primero las más falladas (mayor tasa de fallo y, a igualdad,
 * más fallos en total). Entre las demás, las nunca repasadas van antes que las
 * acertadas. El desempate final es el id, para que el orden sea estable.
 */
export function orderForReview<T extends ReviewableCard>(cards: T[]): T[] {
  const seen = (c: ReviewableCard) => c.correct + c.wrong > 0;
  return [...cards].sort((a, b) => {
    const byRate = failRate(b) - failRate(a);
    if (byRate !== 0) return byRate;
    if (b.wrong !== a.wrong) return b.wrong - a.wrong;
    if (seen(a) !== seen(b)) return seen(a) ? 1 : -1;
    return a.id - b.id;
  });
}

/** Contadores de la tarjeta tras una respuesta. */
export function applyAnswer<T extends ReviewableCard>(
  card: T,
  knew: boolean,
  now: number,
): Pick<T, "correct" | "wrong"> & { lastReviewed: number } {
  return {
    correct: card.correct + (knew ? 1 : 0),
    wrong: card.wrong + (knew ? 0 : 1),
    lastReviewed: now,
  };
}

/** Resumen de una sesión de repaso. */
export function summarizeSession(answers: boolean[]) {
  const total = answers.length;
  const known = answers.filter(Boolean).length;
  return { total, known, missed: total - known };
}
