import { describe, expect, it } from "vitest";
import { hasPdfSignature } from "@/lib/pdf-file";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("hasPdfSignature", () => {
  it("acepta una cabecera %PDF-", () => {
    expect(hasPdfSignature(bytes("%PDF-1.7\n..."))).toBe(true);
  });

  it("rechaza un texto renombrado a .pdf", () => {
    expect(hasPdfSignature(bytes("hola, esto no es un pdf"))).toBe(false);
  });

  it("rechaza un archivo vacío o demasiado corto", () => {
    expect(hasPdfSignature(new Uint8Array())).toBe(false);
    expect(hasPdfSignature(bytes("%PDF"))).toBe(false);
  });
});
