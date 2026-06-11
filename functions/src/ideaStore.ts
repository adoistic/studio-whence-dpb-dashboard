/**
 * ideaStore.ts — Admin-SDK Firestore access for ideas + captures.
 * Thin I/O wrapper: all decisions live in pure modules (ideaAccess,
 * chatgptShare) or the callers; this file only reads/writes documents.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) initializeApp();

const db = () => getFirestore();

const captureRef = (ideaId: string, shareId: string) =>
  db().collection("ideas").doc(ideaId).collection("captures").doc(shareId);

export async function getIdeaData(
  ideaId: string
): Promise<Record<string, unknown> | null> {
  const snap = await db().collection("ideas").doc(ideaId).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

export async function getCaptureData(
  ideaId: string,
  shareId: string
): Promise<Record<string, unknown> | null> {
  const snap = await captureRef(ideaId, shareId).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

/** Create the pending capture doc. Returns false if it already exists. */
export async function createCapture(
  ideaId: string,
  shareId: string,
  url: string,
  source: "function" | "sweeper"
): Promise<boolean> {
  try {
    await captureRef(ideaId, shareId).create({
      url, shareId,
      status: "pending", error: null,
      title: null, model: null, messageCount: null, charCount: null,
      conversationCreatedAt: null, r2Key: null,
      createdAt: FieldValue.serverTimestamp(),
      capturedAt: null, lastAttemptAt: null,
      attempts: 0, source,
    });
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === 6) return false; // ALREADY_EXISTS
    throw err;
  }
}

export async function markCaptured(
  ideaId: string,
  shareId: string,
  fields: {
    title: string; model: string | null;
    messageCount: number; charCount: number;
    createTime: number | null; r2Key: string;
  }
): Promise<void> {
  await captureRef(ideaId, shareId).update({
    status: "captured", error: null,
    title: fields.title, model: fields.model,
    messageCount: fields.messageCount, charCount: fields.charCount,
    conversationCreatedAt:
      fields.createTime !== null
        ? Timestamp.fromMillis(fields.createTime * 1000)
        : null,
    r2Key: fields.r2Key,
    capturedAt: FieldValue.serverTimestamp(),
    lastAttemptAt: FieldValue.serverTimestamp(),
    attempts: FieldValue.increment(1),
    source: "function",
  });
}

export async function markFailed(
  ideaId: string,
  shareId: string,
  error: string
): Promise<void> {
  await captureRef(ideaId, shareId).update({
    status: "failed",
    error: error.slice(0, 300),
    lastAttemptAt: FieldValue.serverTimestamp(),
    attempts: FieldValue.increment(1),
    source: "function",
  });
}

/** All capture doc ids for an idea (delete-branch cleanup). */
export async function listCaptureIds(ideaId: string): Promise<string[]> {
  const snap = await db()
    .collection("ideas").doc(ideaId).collection("captures").get();
  return snap.docs.map((d) => d.id);
}

export async function deleteCaptureDoc(
  ideaId: string,
  shareId: string
): Promise<void> {
  await captureRef(ideaId, shareId).delete();
}
