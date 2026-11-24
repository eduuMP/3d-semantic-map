const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Comprueba que los primeros bytes son la cabecera de un PDF (`%PDF-`). */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_SIGNATURE.length) return false;
  return PDF_SIGNATURE.every((byte, i) => bytes[i] === byte);
}
