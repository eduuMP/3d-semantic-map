"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CHUNKER_VERSION } from "@/lib/chunking";
import { db, deleteDocumentCascade } from "@/lib/db";

export function DocumentList({
  subjectId,
  locked = false,
}: {
  subjectId: number;
  /** Bloquea el borrado (p. ej. mientras se calcula el mapa). */
  locked?: boolean;
}) {
  // `undefined` = cargando, `null` = error al leer IndexedDB.
  const documents = useLiveQuery(
    () =>
      db.documents
        .where("subjectId")
        .equals(subjectId)
        .sortBy("createdAt")
        .catch((e) => {
          console.error("[document-list] no se pudo leer la base de datos", e);
          return null;
        }),
    [subjectId],
  );
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (documents === null) {
    return (
      <p role="alert" className="rounded-lg bg-red-500/15 p-3 text-sm">
        No se pudo leer el almacenamiento del navegador. Cierra otras pestañas
        de la app y recarga.
      </p>
    );
  }
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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-controls="panel-documentos"
        className="fixed top-4 left-4 z-10 rounded-lg border border-current/30 bg-background px-3 py-1.5 text-sm font-medium shadow"
      >
        Documentos ({documents.length})
      </button>
    );
  }

  return (
    <aside
      id="panel-documentos"
      aria-label="Documentos subidos"
      className="fixed top-0 left-0 z-20 flex h-full w-[min(22rem,100vw)] flex-col gap-3 overflow-y-auto border-r border-current/20 bg-background p-4 text-left shadow-xl"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium">
            {documents.length}{" "}
            {documents.length === 1 ? "documento" : "documentos"}
          </h2>
          <p className="text-sm opacity-70">
            {totalPages} páginas · {totalChunks} fragmentos
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-expanded
          aria-controls="panel-documentos"
          className="shrink-0 rounded border border-current/30 px-2 py-1 text-sm"
        >
          Cerrar
        </button>
      </header>
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
              {(doc.chunkerVersion ?? 1) < CHUNKER_VERSION && (
                <p className="text-xs opacity-70">
                  Troceado antiguo: puede cortar a mitad de frase. Quítalo y
                  vuelve a subirlo para cortar por frases.
                </p>
              )}
            </div>
            {confirmingId === doc.id ? (
              <div className="flex shrink-0 items-center gap-2 text-sm">
                <span>¿Seguro?</span>
                <button
                  type="button"
                  onClick={() => remove(doc.id)}
                  disabled={locked}
                  aria-label={`Sí, quitar ${doc.name}`}
                  className="rounded bg-red-600 px-2 py-1 text-white disabled:opacity-50"
                >
                  Sí, quitar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingId(null)}
                  autoFocus
                  className="rounded border border-current/30 px-2 py-1"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingId(doc.id)}
                disabled={locked}
                aria-label={`Quitar ${doc.name}`}
                className="shrink-0 rounded border border-current/30 px-2 py-1 text-sm disabled:opacity-50"
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
    </aside>
  );
}
