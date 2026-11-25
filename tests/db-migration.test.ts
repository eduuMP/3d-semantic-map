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
    await legacy.open();
    expect(await Dexie.exists(name)).toBe(true);
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
    const topicId = (await legacy.table("topics").add({
      documentId: docA,
      name: "Tema",
    })) as number;
    await legacy.table("cards").add({
      topicId,
      chunkId: 1,
      question: "q",
      answer: "a",
      correct: 0,
      wrong: 0,
    });
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

    const topics = await upgraded.topics.toArray();
    expect(topics).toHaveLength(1);
    expect(topics[0].subjectId).toBe(subjects[0].id);
    expect(topics[0].name).toBe("Tema");
    expect("documentId" in topics[0]).toBe(false);
    expect(await upgraded.cards.count()).toBe(1);
  });

  it("migra también una base v1 vacía", async () => {
    const name = freshName();
    const legacy = track(new LegacyV1(name));
    await legacy.open();
    legacy.close();
    expect(await Dexie.exists(name)).toBe(true);

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
    const first = track(new AppDb(name));
    await first.open();
    expect(await first.subjects.count()).toBe(1);
    first.close();
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
    const topic1 = (await database.topics.add({ subjectId: s1 })) as number;
    const topic2 = (await database.topics.add({ subjectId: s2 })) as number;
    const card = (topicId: number, chunkId: number) => ({
      topicId,
      chunkId,
      question: "q",
      answer: "a",
      correct: 0,
      wrong: 0,
    });
    await database.cards.add(card(topic1, d1.chunkId));
    await database.cards.add(card(topic2, d2.chunkId));
    return { s1, s2, d1, d2 };
  }

  it("deleteSubjectCascade borra solo lo de esa asignatura", async () => {
    const database = track(new AppDb(freshName()));
    const { s1, s2 } = await seed(database);

    await deleteSubjectCascade(s2, database);

    expect((await database.subjects.toArray()).map((s) => s.id)).toEqual([s1]);
    expect(await database.documents.count()).toBe(1);
    expect(await database.chunks.count()).toBe(1);
    // Lo de la otra asignatura sobrevive (tema y tarjeta de s1).
    expect(await database.topics.count()).toBe(1);
    expect((await database.topics.toArray())[0].subjectId).toBe(s1);
    expect(await database.cards.count()).toBe(1);
  });

  it("deleteDocumentCascade borra el documento, sus fragmentos y sus tarjetas", async () => {
    const database = track(new AppDb(freshName()));
    const { d1, d2 } = await seed(database);

    await deleteDocumentCascade(d2.documentId, database);

    expect(await database.documents.count()).toBe(1);
    expect((await database.documents.toArray())[0].id).toBe(d1.documentId);
    expect(await database.chunks.count()).toBe(1);
    // Solo se va la tarjeta del documento borrado; los temas no se tocan.
    const cards = await database.cards.toArray();
    expect(cards).toHaveLength(1);
    expect(cards[0].chunkId).toBe(d1.chunkId);
    expect(await database.topics.count()).toBe(2);
  });
});

describe("mapa desactualizado al quitar un PDF", () => {
  it("borra xyz y topicId del resto de la asignatura y conserva los vectores", async () => {
    const database = track(new AppDb(freshName()));
    const subjectId = (await database.subjects.toCollection().first())!.id;
    const other = (await database.subjects.add({
      name: "Otra",
      createdAt: 1,
    })) as number;

    const addDoc = async (sid: number, name: string) => {
      const documentId = (await database.documents.add({
        subjectId: sid,
        name,
        size: 1,
        pages: 1,
        chunkCount: 1,
        createdAt: 1,
      })) as number;
      await database.chunks.add({
        documentId,
        subjectId: sid,
        index: 0,
        page: 1,
        text: name,
        vector: new Float32Array([1, 2]),
        xyz: [0, 0, 0],
        topicId: 7,
      });
      return documentId;
    };
    const a = await addDoc(subjectId, "a.pdf");
    await addDoc(subjectId, "b.pdf");
    await addDoc(other, "c.pdf");

    await deleteDocumentCascade(a, database);

    const remaining = await database.chunks.toArray();
    const b = remaining.find((c) => c.text === "b.pdf")!;
    expect(b.xyz).toBeUndefined();
    expect(b.topicId).toBeUndefined();
    expect(Array.from(b.vector!)).toEqual([1, 2]);

    // Otra asignatura: su mapa no se toca.
    const c = remaining.find((x) => x.text === "c.pdf")!;
    expect(c.xyz).toEqual([0, 0, 0]);
    expect(c.topicId).toBe(7);
  });
});
