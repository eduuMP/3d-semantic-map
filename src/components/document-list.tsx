"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, deleteDocumentCascade } from "@/lib/db";

export function DocumentList() {
  const documents = useLiveQuery(
    () => db.documents.orderBy("createdAt").toArray(),
    [],
  );
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!documents || documents.length === 0) return null;

  const totalPages = documents.reduce((sum, d) => sum + d.pages, 0);
  const totalChunks = documents.reduce((sum, d) => sum + d.chunkCount, 0);

  const remove = async (id: number) => {
    setError(null);
    try {
      await deleteDocumentCascade(id);
    } catch (e) {
      console.error("[document-list] no se pudo borrar", e);
      setError("No se pudo quitar el documento.");
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <section className="flex w-full max-w-xl flex-col gap-2 text-left">
      <p className="text-sm font-medium">
        {documents.length} {documents.length === 1 ? "documento" : "documentos"}{" "}
        · {totalPages} páginas · {totalChunks} fragmentos
      </p>
      <ul className="flex flex-col gap-2">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-current/20 p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium" title={doc.name}>
                {doc.name}
              </p>
              <p className="text-sm opacity-70">
                {doc.pages} páginas · {doc.chunkCount} fragmentos
              </p>
            </div>
            {confirmingId === doc.id ? (
              <div className="flex shrink-0 items-center gap-2 text-sm">
                <span>¿Seguro?</span>
                <button
                  type="button"
                  onClick={() => remove(doc.id)}
                  className="rounded bg-red-600 px-2 py-1 text-white"
                >
                  Sí, quitar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingId(null)}
                  className="rounded border border-current/30 px-2 py-1"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingId(doc.id)}
                aria-label={`Quitar ${doc.name}`}
                className="shrink-0 rounded border border-current/30 px-2 py-1 text-sm"
              >
                Quitar
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="rounded-lg bg-red-500/15 p-3 text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
