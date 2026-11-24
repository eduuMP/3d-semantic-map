export type FileInfo = { name: string; size: number };

export type UploadPlan<T extends FileInfo> = {
  toProcess: T[];
  duplicates: T[];
};

const keyOf = ({ name, size }: FileInfo) => `${name}\u0000${size}`;

/**
 * Separa los archivos seleccionados en los que hay que procesar y los
 * duplicados (mismo nombre y tamaño que uno ya subido o repetido dentro de
 * la propia selección). Conserva el orden de la selección.
 */
export function planUploads<T extends FileInfo>(
  files: readonly T[],
  existing: readonly FileInfo[],
): UploadPlan<T> {
  const seen = new Set(existing.map(keyOf));
  const toProcess: T[] = [];
  const duplicates: T[] = [];

  for (const file of files) {
    const key = keyOf(file);
    if (seen.has(key)) {
      duplicates.push(file);
    } else {
      seen.add(key);
      toProcess.push(file);
    }
  }

  return { toProcess, duplicates };
}
