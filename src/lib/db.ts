import Dexie, { type EntityTable } from "dexie";

export type DocumentRecord = {
  id: number;
  name: string;
  size: number;
  pages: number;
  chunkCount: number;
  createdAt: number;
};

export type ChunkRecord = {
  id: number;
  documentId: number;
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
  documentId: number;
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
  documents!: EntityTable<DocumentRecord, "id">;
  chunks!: EntityTable<ChunkRecord, "id">;
  topics!: EntityTable<TopicRecord, "id">;
  cards!: EntityTable<CardRecord, "id">;

  constructor() {
    super("mapa-semantico-3d");
    this.version(1).stores({
      documents: "++id, createdAt",
      chunks: "++id, documentId, page, topicId",
      topics: "++id, documentId",
      cards: "++id, topicId, chunkId",
    });
  }
}

export const db = new AppDb();

/** Borra un documento y todo lo que cuelga de él (fragmentos, temas, tarjetas). */
export async function deleteDocumentCascade(documentId: number) {
  await db.transaction(
    "rw",
    [db.documents, db.chunks, db.topics, db.cards],
    async () => {
      const topicIds = await db.topics
        .where("documentId")
        .equals(documentId)
        .primaryKeys();
      await db.cards.where("topicId").anyOf(topicIds).delete();
      await db.topics.where("documentId").equals(documentId).delete();
      await db.chunks.where("documentId").equals(documentId).delete();
      await db.documents.delete(documentId);
    },
  );
}
