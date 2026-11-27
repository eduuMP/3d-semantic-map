"use client";

import { useRef, useState } from "react";
import { discardCard, recordReview, type CardRecord } from "@/lib/db";
import { orderForReview, summarizeSession } from "@/lib/review";

type ReviewModeProps = {
  /** Tarjetas a repasar; el orden se calcula una vez al empezar. */
  cards: CardRecord[];
  pageOf: (chunkId: number) => number | undefined;
  onExit: () => void;
};

/** Repaso de tarjetas: dar la vuelta, «la sabía» / «no la sabía», descartar. */
export function ReviewMode({ cards, pageOf, onExit }: ReviewModeProps) {
  const [queue, setQueue] = useState(() => orderForReview(cards));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Evita registrar dos veces una respuesta con un doble clic. */
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);

  const current = queue[index];

  const advance = () => {
    setIndex((i) => i + 1);
    setFlipped(false);
    setConfirmDiscard(false);
  };

  const answer = async (knew: boolean) => {
    if (!current || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const saved = await recordReview(current.id, knew);
      // Si la tarjeta ya no existe (p. ej. se borró el documento) se avanza sin contarla.
      if (saved) setAnswers((prev) => [...prev, knew]);
      advance();
    } catch {
      setError("No se pudo guardar la respuesta. Inténtalo de nuevo.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!current || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      await discardCard(current.id);
      // La tarjeta sale de la cola; el índice ya apunta a la siguiente.
      setQueue((prev) => prev.filter((c) => c.id !== current.id));
      setFlipped(false);
      setConfirmDiscard(false);
    } catch {
      setError("No se pudo descartar la tarjeta. Inténtalo de nuevo.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  if (!current) {
    const { total, known, missed } = summarizeSession(answers);
    return (
      <section aria-label="Repaso" className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Repaso terminado</h3>
        <p aria-live="polite" className="text-sm">
          {total === 0
            ? "No quedan tarjetas por repasar."
            : `Sabías ${known} de ${total}${missed > 0 ? ` · fallaste ${missed}` : ""}.`}
        </p>
        <button
          type="button"
          onClick={onExit}
          className="self-start rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          Volver
        </button>
      </section>
    );
  }

  const page = pageOf(current.chunkId);
  const attempts = current.correct + current.wrong;

  return (
    <section aria-label="Repaso" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          Tarjeta {index + 1} de {queue.length}
        </h3>
        <button
          type="button"
          onClick={onExit}
          className="rounded border border-current/30 px-2 py-1 text-sm"
        >
          Salir
        </button>
      </div>

      <div className="rounded-lg bg-current/5 p-3 text-sm leading-relaxed">
        <p className="font-medium break-words">{current.question}</p>
        {flipped && (
          <p className="mt-2 border-t border-current/20 pt-2 break-words">
            {current.answer}
          </p>
        )}
        <p className="mt-2 text-xs opacity-70">
          {page !== undefined ? `p. ${page}` : "página desconocida"} ·{" "}
          {attempts === 0
            ? "nueva"
            : `${current.correct} aciertos · ${current.wrong} fallos`}
        </p>
      </div>

      {!flipped ? (
        <button
          type="button"
          onClick={() => setFlipped(true)}
          className="self-start rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          Dar la vuelta
        </button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => answer(true)}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            La sabía
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => answer(false)}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            No la sabía
          </button>
        </div>
      )}

      {confirmDiscard ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>¿Descartar esta tarjeta para siempre?</span>
          <button
            type="button"
            disabled={busy}
            onClick={discard}
            className="rounded border border-red-600 px-2 py-1 text-red-600 disabled:opacity-50"
          >
            Sí, descartar
          </button>
          <button
            type="button"
            onClick={() => setConfirmDiscard(false)}
            className="rounded border border-current/30 px-2 py-1"
          >
            No
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmDiscard(true)}
          className="self-start text-xs underline opacity-80"
        >
          Descartar tarjeta
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
