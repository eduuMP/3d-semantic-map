"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { resolveActiveSubject } from "@/lib/subjects";
import { useStoredSubjectId } from "@/lib/use-active-subject";
import { DocumentList } from "./document-list";
import { PdfUpload } from "./pdf-upload";
import { SubjectPicker } from "./subject-picker";

export function Library() {
  // `undefined` = cargando, `null` = error al leer IndexedDB.
  const subjects = useLiveQuery(
    () =>
      db.subjects
        .orderBy("id")
        .toArray()
        .catch((e) => {
          console.error("[library] no se pudo leer la base de datos", e);
          return null;
        }),
    [],
  );
  const [storedId, setStoredId] = useStoredSubjectId();
  const [uploading, setUploading] = useState(false);

  if (subjects === null) {
    return (
      <p role="alert" className="rounded-lg bg-red-500/15 p-3 text-sm">
        No se pudo abrir el almacenamiento del navegador. Cierra otras pestañas
        de la app y recarga.
      </p>
    );
  }
  if (!subjects) return null;

  const activeId = resolveActiveSubject(subjects, storedId);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <SubjectPicker
        subjects={subjects}
        activeId={activeId}
        onSelect={setStoredId}
        disabled={uploading}
      />
      {activeId !== null && (
        <>
          <PdfUpload
            key={activeId}
            subjectId={activeId}
            onBusyChange={setUploading}
          />
          <DocumentList subjectId={activeId} />
        </>
      )}
    </div>
  );
}
