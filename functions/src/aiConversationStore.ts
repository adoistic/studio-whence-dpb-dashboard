/**
 * aiConversationStore.ts — Admin-SDK Firestore access for AI conversations.
 *
 * Thin I/O wrapper mirroring `ideaStore.ts`: the only decision logic lives in
 * the pure `aiConversationAccess.ts` module; this file just reads the document.
 *
 * The `aiConversations/{convId}` docs are written by the Admin SDK only (the
 * capture pipeline) — there are no client writes — so this reader is enough for
 * the gated `/ai-conversation` route.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) initializeApp();

const db = () => getFirestore();

/** Read `aiConversations/{convId}`, or `null` when the doc is absent. */
export async function getAiConversationData(
  convId: string
): Promise<Record<string, unknown> | null> {
  const snap = await db().collection("aiConversations").doc(convId).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}
