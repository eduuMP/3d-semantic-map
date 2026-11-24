"use client";

import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, deleteSubjectCascade, type SubjectRecord } from "@/lib/db";
import { MAX_SUBJECT_NAME_LENGTH, validateSubjectName } from "@/lib/subjects";

type Mode = "idle" | "creating" | "renaming" | "deleting";

type SubjectPickerProps = {
  subjects: SubjectRecord[];
  activeId: number | null;
  onSelect: (id: number) => void;
  /** Bloquea los cambios mientras se sube un PDF. */
  disabled?: boolean;
};

export function SubjectPicker({
  subjects,
  activeId,
  onSelect,
  disabled = false,
}: SubjectPickerProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const active = subjects.find((s) => s.id === activeId) ?? null;
  const documentCount = useLiveQuery(
    () =>
      activeId === null
        ? 0
        : db.documents.where("subjectId").equals(activeId).count(),
    [activeId],
  );

  // Sin asignaturas, el único camino es crear la primera.
  const effectiveMode: Mode = subjects.length === 0 ? "creating" : mode;

  const reset = () => {
    setMode("idle");
    setDraft("");
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = validateSubjectName(
      draft,
      subjects,
      effectiveMode === "renaming" ? (active?.id ?? undefined) : undefined,
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    try {
      if (effectiveMode === "renaming" && active) {
        await db.subjects.update(active.id, { name: result.name });
      } else {
        const id = (await db.subjects.add({
          name: result.name,
          createdAt: Date.now(),
        } as SubjectRecord)) as number;
        onSelect(id);
      }
      reset();
    } catch (e) {
      console.error("[subject-picker] no se pudo guardar", e);
      setError("No se pudo guardar la asignatura.");
    }
  };

  const confirmDelete = async () => {
    if (!active) return;
    try {
      await deleteSubjectCascade(active.id);
      reset();
    } catch (e) {
      console.error("[subject-picker] no se pudo borrar", e);
      setError("No se pudo borrar la asignatura.");
      setMode("idle");
    }
  };

  if (effectiveMode === "creating" || effectiveMode === "renaming") {
    return (
      <form
        onSubmit={submit}
        className="flex w-full max-w-xl flex-col gap-2 text-left"
      >
        <label htmlFor="subject-name" className="text-sm font-medium">
          {effectiveMode === "renaming"
            ? "Nuevo nombre de la asignatura"
            : subjects.length === 0
              ? "Crea tu primera asignatura"
              : "Nombre de la nueva asignatura"}
        </label>
        <div className="flex gap-2">
          <input
            id="subject-name"
            autoFocus
            value={draft}
            maxLength={MAX_SUBJECT_NAME_LENGTH + 20}
            onChange={(e) => setDraft(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-current/30 bg-transparent px-3 py-2 text-sm"
            placeholder="Ej. Física II"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
          >
            Guardar
          </button>
          {subjects.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-current/30 px-3 py-2 text-sm"
            >
              Cancelar
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
      </form>
    );
  }

  if (effectiveMode === "deleting" && active) {
    return (
      <div className="flex w-full max-w-xl flex-col gap-2 rounded-lg border border-red-500/40 p-3 text-left text-sm">
        <p>
          ¿Borrar <strong>{active.name}</strong>
          {documentCount
            ? ` con ${documentCount} ${documentCount === 1 ? "PDF" : "PDFs"}`
            : ""}
          ? Se perderán sus fragmentos y no se puede deshacer.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={confirmDelete}
            aria-label={`Sí, borrar ${active.name}`}
            className="rounded bg-red-600 px-3 py-1 text-white"
          >
            Sí, borrar
          </button>
          <button
            type="button"
            autoFocus
            onClick={reset}
            className="rounded border border-current/30 px-3 py-1"
          >
            No
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-2 text-left">
      <label htmlFor="subject-select" className="text-sm font-medium">
        Asignatura
      </label>
      <div className="flex flex-wrap gap-2">
        <select
          id="subject-select"
          value={activeId ?? ""}
          disabled={disabled}
          onChange={(e) => onSelect(Number(e.target.value))}
          className="bg-background text-foreground min-w-0 flex-1 rounded-lg border border-current/30 px-3 py-2 text-sm"
        >
          {subjects.map((subject) => (
            <option
              key={subject.id}
              value={subject.id}
              className="bg-background text-foreground"
            >
              {subject.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setDraft("");
            setError(null);
            setMode("creating");
          }}
          className="rounded-lg border border-current/30 px-3 py-2 text-sm disabled:opacity-50"
        >
          Nueva
        </button>
        <button
          type="button"
          disabled={disabled || !active}
          onClick={() => {
            setDraft(active?.name ?? "");
            setError(null);
            setMode("renaming");
          }}
          className="rounded-lg border border-current/30 px-3 py-2 text-sm disabled:opacity-50"
        >
          Renombrar
        </button>
        <button
          type="button"
          disabled={disabled || !active}
          onClick={() => {
            setError(null);
            setMode("deleting");
          }}
          className="rounded-lg border border-current/30 px-3 py-2 text-sm disabled:opacity-50"
        >
          Borrar
        </button>
      </div>
      {disabled && (
        <p className="text-xs opacity-60">
          No se puede cambiar de asignatura mientras se sube un PDF.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
