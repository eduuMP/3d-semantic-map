/// <reference lib="webworker" />
import { chunkPages, type PageText } from "../lib/chunking";
import { db } from "../lib/db";
import type {
  IngestErrorCode,
  IngestMessage,
  IngestRequest,
} from "../lib/ingest-protocol";
import { hasPdfSignature } from "../lib/pdf-file";

const post = (message: IngestMessage) => self.postMessage(message);

class IngestError extends Error {
  constructor(
    readonly code: IngestErrorCode,
    message: string,
  ) {
    super(message);
  }
}

async function extractPages(data: Uint8Array): Promise<PageText[]> {
  // Ya estamos dentro de un worker: pdfjs usa su "fake worker" en este hilo
  // si encuentra el handler en globalThis.pdfjsWorker (sin worker anidado).
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.mjs");
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;

  const task = pdfjs.getDocument({ data });
  const pdf = await task.promise;
  const pages: PageText[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      post({
        type: "progress",
        phase: "extracting",
        current: n,
        total: pdf.numPages,
      });
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
        )
        .join("");
      pages.push({ page: n, text });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return pages;
}

async function ingest(file: File, subjectId: number) {
  post({ type: "progress", phase: "reading", current: 0, total: 1 });
  const data = new Uint8Array(await file.arrayBuffer());
  if (!hasPdfSignature(data)) {
    throw new IngestError("not-pdf", "Cabecera %PDF- no encontrada");
  }

  let pages: PageText[];
  try {
    pages = await extractPages(data);
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") {
      throw new IngestError("encrypted", "PDF protegido con contraseña");
    }
    throw new IngestError(
      "not-pdf",
      error instanceof Error ? error.message : "PDF ilegible",
    );
  }

  post({ type: "progress", phase: "chunking", current: 0, total: 1 });
  const chunks = chunkPages(pages);
  if (chunks.length === 0) {
    throw new IngestError("no-text", "El PDF no contiene texto extraíble");
  }

  // Solo se añade: los PDFs anteriores se conservan. Documento y fragmentos
  // se guardan en una sola transacción, así un fallo no deja datos a medias.
  post({ type: "progress", phase: "saving", current: 0, total: chunks.length });
  const documentId = await db.transaction(
    "rw",
    [db.subjects, db.documents, db.chunks],
    async () => {
      // La asignatura pudo borrarse (otra pestaña) durante la extracción.
      if (!(await db.subjects.get(subjectId))) {
        throw new IngestError("no-subject", "La asignatura ya no existe");
      }
      const id = await db.documents.add({
        subjectId,
        name: file.name,
        size: file.size,
        pages: pages.length,
        chunkCount: chunks.length,
        createdAt: Date.now(),
      });
      await db.chunks.bulkAdd(
        chunks.map((c) => ({
          documentId: id,
          subjectId,
          index: c.index,
          page: c.page,
          text: c.text,
        })),
      );
      return id;
    },
  );

  post({
    type: "done",
    documentId,
    pages: pages.length,
    chunks: chunks.length,
  });
}

self.onmessage = async (event: MessageEvent<IngestRequest>) => {
  if (event.data.type !== "ingest") return;
  try {
    await ingest(event.data.file, event.data.subjectId);
  } catch (error) {
    if (error instanceof IngestError) {
      post({ type: "error", code: error.code, message: error.message });
    } else {
      post({
        type: "error",
        code: "unknown",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
};
