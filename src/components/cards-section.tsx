"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  DEFAULT_CARD_COUNT,
  FRAGMENT_CARD_COUNT,
  MAX_CARD_COUNT,
} from "@/lib/cards";
import { db } from "@/lib/db";
import type { LlmCards } from "@/lib/use-llm";
import { ReviewMode } from "./review-mode";

type CardsSectionProps = {
  /** Fragmentos entre los que se reparten las tarjetas. */
  chunkIds: number[];
  /** `topic`: elige cuántas · `fragment`: botón «Hacerme preguntas» sobre un fragmento. */
  variant: "topic" | "fragment";
  pageOf: (chunkId: number) => number | undefined;
  progress: LlmCards | null;
  busy: boolean;
  onGenerate: (chunkIds: number[], count: number) => void;
  onStop: () => void;
};

function noteOf(p: LlmCards) {
  if (!p.finished || p.error) return null;
  const { requested, failed, cancelled } = p.finished;
  if (cancelled) return `Parado: se guardaron ${p.saved} de ${requested}.`;
  if (failed > 0 || p.saved < requested)
    return `Se crearon ${p.saved} de ${requested} tarjetas (el resto salieron inválidas o repetidas).`;
  return `Listo: ${p.saved} ${p.saved === 1 ? "tarjeta nueva" : "tarjetas nuevas"}.`;
}

/** Generar tarjetas de estudio y ver las ya creadas de un tema o fragmento. */
export function CardsSection({
  chunkIds,
  variant,
  pageOf,
  progress,
  busy,
  onGenerate,
  onStop,
}: CardsSectionProps) {
  const [count, setCount] = useState(DEFAULT_CARD_COUNT);
  const [reviewing, setReviewing] = useState(false);
  const key = chunkIds.join(",");
  const cards = useLiveQuery(
    () => db.cards.where("chunkId").anyOf(chunkIds).toArray(),
    // chunkIds cambia de identidad en cada render: se compara por contenido.
    [key],
  );
  const generating = progress !== null && !progress.finished;
  const total = variant === "topic" ? count : FRAGMENT_CARD_COUNT;
  const note = progress ? noteOf(progress) : null;

  if (reviewing && cards) {
    return (
      <ReviewMode
        cards={cards}
        pageOf={pageOf}
        onExit={() => setReviewing(false)}
      />
    );
  }

  return (
    <section aria-label="Tarjetas" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        Tarjetas{cards && cards.length > 0 ? ` (${cards.length})` : ""}
      </h3>

      <div className="flex flex-wrap items-center gap-2">
        {variant === "topic" && (
          <label className="flex items-center gap-1 text-sm">
            Cuántas
            <input
              type="number"
              min={1}
              max={MAX_CARD_COUNT}
              value={count}
              disabled={generating}
              onChange={(e) =>
                setCount(
                  Math.min(
                    MAX_CARD_COUNT,
                    Math.max(1, Math.floor(Number(e.target.value)) || 1),
                  ),
                )
              }
              className="w-14 rounded border border-current/30 bg-transparent px-1 py-0.5"
            />
          </label>
        )}
        <button
          type="button"
          disabled={busy || generating || chunkIds.length === 0}
          onClick={() => onGenerate(chunkIds, total)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {variant === "topic" ? "Generar tarjetas" : "Hacerme preguntas"}
        </button>
        <button
          type="button"
          disabled={generating || !cards || cards.length === 0}
          onClick={() => setReviewing(true)}
          className="rounded border border-current/30 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Repasar{cards && cards.length > 0 ? ` (${cards.length})` : ""}
        </button>
        {generating && (
          <button
            type="button"
            onClick={onStop}
            className="rounded border border-current/30 px-2 py-1.5 text-sm"
          >
            Parar
          </button>
        )}
      </div>

      {generating && progress && (
        <div aria-live="polite" className="text-sm">
          <p>
            Tarjeta {Math.min(progress.done + 1, progress.total)} de{" "}
            {progress.total}… ({progress.saved} guardadas)
          </p>
          <div className="mt-1 h-1.5 w-full rounded bg-current/15">
            <div
              className="h-full rounded bg-blue-600 transition-all"
              style={{
                width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}
      {note && (
        <p aria-live="polite" className="text-sm opacity-80">
          {note}
        </p>
      )}
      {progress?.error && (
        <p role="alert" className="text-sm text-red-600">
          {progress.error}
        </p>
      )}

      {cards && cards.length > 0 && (
        <ul className="flex flex-col gap-2">
          {cards.map((card) => {
            const page = pageOf(card.chunkId);
            return (
              <li
                key={card.id}
                className="rounded-lg bg-current/5 p-2 text-sm leading-relaxed"
              >
                <p className="font-medium break-words">{card.question}</p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs underline">
                    Ver respuesta
                  </summary>
                  <p className="mt-1 break-words">{card.answer}</p>
                </details>
                <p className="mt-1 text-xs opacity-70">
                  {page !== undefined ? `p. ${page}` : "página desconocida"}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
