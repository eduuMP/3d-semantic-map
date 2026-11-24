import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import {
  AppDb,
  DEFAULT_SUBJECT_NAME,
  deleteDocumentCascade,
  deleteSubjectCascade,
} from "@/lib/db";

let counter = 0;
const freshName = () => `test-db-${counter++}`;
const open: Dexie[] = [];
const track = <T extends Dexie>(database: T) => {
  open.push(database);
  return database;
};

afterEach(async () => {
  for (const database of open.splice(0)) {
    database.close();
    await Dexie.delete(database.name);
  }
});

/** Réplica de la base de datos de H1/H1b (versión 1, sin asignaturas). */
class LegacyV1 extends Dexie {
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      documents: "++id, createdAt",
      chunks: "++id, documentId, page, topicId",
      topics: "++id, documentId",
      cards: "++id, topicId, chunkId",
    });
  }
}

describe("migración v1 → v2", () => {
  it("conserva documentos y fragmentos y los mueve a «Mis apuntes»", async () => {
    const name = freshName();
    const legacy = track(new LegacyV1(name));
    const docA = (await legacy.table("documents").add({
      name: "a.pdf",
      size: 1,
      pages: 2,
      chunkCount: 2,
      createdAt: 1,
    })) as number;
    const docB = (await legacy.table("documents").add({
      name: "b.pdf",
      size: 2,
      pages: 1,
      chunkCount: 1,
      createdAt: 2,
    })) as number;
    await legacy.table("chunks").bulkAdd([
      { documentId: docA, index: 0, page: 1, text: "uno" },
      { documentId: docA, index: 1, page: 2, text: "dos" },
      { documentId: docB, index: 0, page: 1, text: "tres" },
    ]);
    legacy.close();

    const upgraded = track(new AppDb(name));
    const subjects = await upgraded.subjects.toArray();
    expect(subjects).toHaveLength(1);
    expect(subjects[0].name).toBe(DEFAULT_SUBJECT_NAME);

    const documents = await upgraded.documents.toArray();
    const chunks = await upgraded.chunks.toArray();
    expect(documents.map((d) => d.name).sort()).toEqual(["a.pdf", "b.pdf"]);
    expect(chunks.map((c) => c.text).sort()).toEqual(["dos", "tres", "uno"]);
    expect(documents.every((d) => d.subjectId === subjects[0].id)).toBe(true);
    expect(chunks.every((c) => c.subjectId === subjects[0].id)).toBe(true);
  });

  it("migra también una base v1 vacía", async () => {
    const name = freshName();
    track(new LegacyV1(name)).close();
    const upgraded = track(new AppDb(name));
    expect(await upgraded.subjects.count()).toBe(1);
    expect(await upgraded.documents.count()).toBe(0);
  });

  it("una base nueva se crea con la asignatura por defecto", async () => {
    const fresh = track(new AppDb(freshName()));
    const subjects = await fresh.subjects.toArray();
    expect(subjects.map((s) => s.name)).toEqual([DEFAULT_SUBJECT_NAME]);
  });

  it("abrir dos veces no duplica la asignatura por defecto", async () => {
    const name = freshName();
    track(new AppDb(name)).close();
    const again = track(new AppDb(name));
    expect(await again.subjects.count()).toBe(1);
  });
});

describe("borrado en cascada", () => {
  async function seed(database: AppDb) {
    const s1 = (await database.subjects.toCollection().first())!.id;
    const s2 = (await database.subjects.add({
      name: "Física",
      createdAt: 1,
    })) as number;
    const mk = async (subjectId: number, name: string) => {
      const documentId = (await database.documents.add({
        subjectId,
        name,
        size: 1,
        pages: 1,
        chunkCount: 1,
        createdAt: 1,
      })) as number;
      const chunkId = (await database.chunks.add({
        documentId,
        subjectId,
        index: 0,
        page: 1,
        text: name,
      })) as number;
      return { documentId, chunkId };
    };
    const d1 = await mk(s1, "a.pdf");
    const d2 = await mk(s2, "b.pdf");
    const topic2 = (await database.topics.add({ subjectId: s2 })) as number;
    await database.cards.add({
      topicId: topic2,
      chunkId: d2.chunkId,
      question: "q",
      answer: "a",
      correct: 0,
      wrong: 0,
    });
    return { s1, s2, d1, d2 };
  }

  it("deleteSubjectCascade borra solo lo de esa asignatura", async () => {
    const database = track(new AppDb(freshName()));
    const { s1, s2 } = await seed(database);

    await deleteSubjectCascade(s2, database);

    expect((await database.subjects.toArray()).map((s) => s.id)).toEqual([s1]);
    expect(await database.documents.count()).toBe(1);
    expect(await database.chunks.count()).toBe(1);
    expect(await database.topics.count()).toBe(0);
    expect(await database.cards.count()).toBe(0);
  });

  it("deleteDocumentCascade borra el documento, sus fragmentos y sus tarjetas", async () => {
    const database = track(new AppDb(freshName()));
    const { d1, d2 } = await seed(database);

    await deleteDocumentCascade(d2.documentId, database);

    expect(await database.documents.count()).toBe(1);
    expect((await database.documents.toArray())[0].id).toBe(d1.documentId);
    expect(await database.chunks.count()).toBe(1);
    expect(await database.cards.count()).toBe(0);
  });
});
