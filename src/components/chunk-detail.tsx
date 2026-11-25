"use client";

import { useEffect, useRef } from "react";

type ChunkDetailProps = {
  text: string;
  page: number;
  documentName: string;
  topicName: string | null;
  onClose: () => void;
};

/** Panel con el fragmento completo del punto seleccionado en el mapa. */
export function ChunkDetail({
  text,
  page,
  documentName,
  topicName,
  onClose,
}: ChunkDetailProps) {
  const ref = useRef<HTMLElement>(null);

  // Al elegir un punto, el panel (que está bajo el mapa) se muestra solo.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [text, page, documentName]);

  return (
    <article
      ref={ref}
      aria-label="Fragmento seleccionado"
      className="relative left-1/2 mt-2 w-[min(64rem,calc(100vw-4rem))] -translate-x-1/2 scroll-mt-4 rounded-lg border border-current/20 p-4 text-left"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {topicName && (
            <p className="text-xs font-medium uppercase tracking-wide opacity-70">
              {topicName}
            </p>
          )}
          <h2 className="font-medium break-words">
            {documentName} · p. {page}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded border border-current/30 px-2 py-1 text-sm"
        >
          Cerrar
        </button>
      </header>
      <p className="mt-3 max-h-80 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap">
        {text}
      </p>
    </article>
  );
}
