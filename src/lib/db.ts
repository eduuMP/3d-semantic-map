import Dexie, { type EntityTable } from "dexie";

export const DEFAULT_SUBJECT_NAME = "Mis apuntes";

export type SubjectRecord = {
  id: number;
  name: string;
  createdAt: number;
};

export type DocumentRecord = {
  id: number;
  subjectId: number;
  name: string;
  size: number;
  pages: number;
  chunkCount: number;
  /** Versión del troceado (`CHUNKER_VERSION`). Sin ella, el PDF se troceó por palabras. */
  chunkerVersion?: number;
  createdAt: number;
};

export type ChunkRecord = {
  id: number;
  documentId: number;
  /** Copia de `documents.subjectId`: permite pedir todos los fragmentos de una asignatura con una sola consulta. */
  subjectId: number;
  index: number;
  page: number;
  text: string;
  /** Se rellenan en H2 (embeddings, UMAP) y H3 (temas). */
  vector?: Float32Array;
  xyz?: [number, number, number];
  topicId?: number;
};

export type TopicRecord = {
  id: number;
  subjectId: number;
  name?: string;
};

export type CardRecord = {
  id: number;
  topicId: number;
  chunkId: number;
  question: string;
  answer: string;
  correct: number;
  wrong: number;
  lastReviewed?: number;
};

export class AppDb extends Dexie {
  subjects!: EntityTable<SubjectRecord, "id">;
  documents!: EntityTable<DocumentRecord, "id">;
  chunks!: EntityTable<ChunkRecord, "id">;
  topics!: EntityTable<TopicRecord, "id">;
  cards!: EntityTable<CardRecord, "id">;

  constructor(name = "mapa-semantico-3d") {
    super(name);

    // v1 (H1/H1b): sin asignaturas. Se conserva declarada para poder migrar.
    this.version(1).stores({
      documents: "++id, createdAt",
      chunks: "++id, documentId, page, topicId",
      topics: "++id, documentId",
      cards: "++id, topicId, chunkId",
    });

    // v2 (H1c): asignaturas. Todo lo que ya existía pasa a "Mis apuntes".
    this.version(2)
      .stores({
        subjects: "++id, name",
        documents: "++id, subjectId, createdAt",
        chunks: "++id, documentId, subjectId, page, topicId",
        topics: "++id, subjectId",
        cards: "++id, topicId, chunkId",
      })
      .upgrade(async (tx) => {
        const subjectId = (await tx.table("subjects").add({
          name: DEFAULT_SUBJECT_NAME,
          createdAt: Date.now(),
        })) as number;
        await tx.table("documents").toCollection().modify({ subjectId });
        await tx.table("chunks").toCollection().modify({ subjectId });
        await tx
          .table("topics")
          .toCollection()
          .modify((topic) => {
            topic.subjectId = subjectId;
            delete topic.documentId;
          });
      });

    // Base de datos nueva (no migración): se crea la asignatura por defecto.
    this.on("populate", (tx) => {
      tx.table("subjects").add({
        name: DEFAULT_SUBJECT_NAME,
        createdAt: Date.now(),
      });
    });
  }
}

export const db = new AppDb();

/**
 * Borra un documento con sus fragmentos y las tarjetas generadas desde ellos.
 * El mapa de su asignatura queda desactualizado: se borran las coordenadas y
 * el tema del resto de fragmentos (los vectores se conservan).
 */
export async function deleteDocumentCascade(
  documentId: number,
  database: AppDb = db,
) {
  await database.transaction(
    "rw",
    [database.documents, database.chunks, database.cards],
    async () => {
      const document = await database.documents.get(documentId);
      const chunkIds = await database.chunks
        .where("documentId")
        .equals(documentId)
        .primaryKeys();
      await database.cards.where("chunkId").anyOf(chunkIds).delete();
      await database.chunks.where("documentId").equals(documentId).delete();
      await database.documents.delete(documentId);
      if (document) {
        await database.chunks
          .where("subjectId")
          .equals(document.subjectId)
          .modify((chunk) => {
            delete chunk.xyz;
            delete chunk.topicId;
          });
      }
    },
  );
}

/** Borra una asignatura con sus documentos, fragmentos, temas y tarjetas. */
export async function deleteSubjectCascade(
  subjectId: number,
  database: AppDb = db,
) {
  await database.transaction(
    "rw",
    [
      database.subjects,
      database.documents,
      database.chunks,
      database.topics,
      database.cards,
    ],
    async () => {
      const topicIds = await database.topics
        .where("subjectId")
        .equals(subjectId)
        .primaryKeys();
      await database.cards.where("topicId").anyOf(topicIds).delete();
      await database.topics.where("subjectId").equals(subjectId).delete();
      await database.chunks.where("subjectId").equals(subjectId).delete();
      await database.documents.where("subjectId").equals(subjectId).delete();
      await database.subjects.delete(subjectId);
    },
  );
}
