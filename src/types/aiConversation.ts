import type { Timestamp } from 'firebase/firestore'

/** Where an AI conversation is attached in the catalog. */
export interface AiConversationAttachTo {
  kind: string          // e.g. 'line' | 'comic'
  line: string          // line slug
  comicSlug?: string    // present when attached to a specific comic
}

export type AiConversationStatus = 'pending' | 'captured' | 'failed'

/**
 * A migrated AI chat conversation, at aiConversations/{id}.
 *
 * Client-facing shape: server-only fields (r2Key, addedBy, …) are dropped — the
 * transcript markdown is fetched on demand through the gated /ai-conversation
 * route (see readAiConversation in dataApi.ts).
 */
export interface AiConversation {
  id: string
  attachTo: AiConversationAttachTo
  title: string | null
  model: string | null
  messageCount: number | null
  charCount: number | null
  conversationCreatedAt: Timestamp | null
  status: AiConversationStatus
  createdAt: Timestamp | null
}
