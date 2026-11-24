export const MAX_SUBJECT_NAME_LENGTH = 60;

type NamedSubject = { id: number; name: string };

export type SubjectNameResult =
  { ok: true; name: string } | { ok: false; error: string };

/** Quita espacios sobrantes (extremos y repetidos). */
export function cleanSubjectName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Clave para comparar nombres sin distinguir mayúsculas ni tildes. */
function foldName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Valida el nombre de una asignatura. `currentId` es la asignatura que se está
 * renombrando (puede conservar su propio nombre).
 */
export function validateSubjectName(
  rawName: string,
  existing: readonly NamedSubject[],
  currentId?: number,
): SubjectNameResult {
  const name = cleanSubjectName(rawName);
  if (name.length === 0) {
    return { ok: false, error: "Escribe un nombre para la asignatura." };
  }
  if (name.length > MAX_SUBJECT_NAME_LENGTH) {
    return {
      ok: false,
      error: `El nombre no puede pasar de ${MAX_SUBJECT_NAME_LENGTH} caracteres.`,
    };
  }
  const key = foldName(name);
  const clash = existing.some(
    (subject) => subject.id !== currentId && foldName(subject.name) === key,
  );
  if (clash) {
    return { ok: false, error: "Ya existe una asignatura con ese nombre." };
  }
  return { ok: true, name };
}

/** Asignatura activa: la guardada si sigue existiendo, si no la primera. */
export function resolveActiveSubject(
  subjects: readonly { id: number }[],
  storedId: number | null,
): number | null {
  if (subjects.length === 0) return null;
  if (storedId !== null && subjects.some((s) => s.id === storedId)) {
    return storedId;
  }
  return subjects[0].id;
}
