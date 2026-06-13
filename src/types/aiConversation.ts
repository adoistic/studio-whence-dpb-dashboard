import type { Timestamp } from 'firebase/firestore'

/** Where an AI conversation is attached in the catalog. */
export interface AiConversationAttachTo {
  kind: string          // e.g. 'line' | 'comic' | 'figure'
  line: string          // line slug
  comicSlug?: string    // present when attached to a specific comic
  figureSlug?: string   // present when attached to a specific figure (e.g. a disease)
  open?: boolean        // whether the conversation surfaces in the gated reader
}

export type AiConversationStatus = 'pending' | 'captured' | 'failed'

/** A located span in the verbatim transcript. `line` is 1-based over the
 *  transcript split on "\n"; `resolved:false` → render as non-clickable text. */
export interface AnchorRef {
  quote: string
  charStart: number
  charEnd: number
  line: number
  resolved: boolean
}

/** One chapter of the analysed conversation. */
export interface AnalysisChapter {
  id: string
  title: string
  summary: string
  anchor: AnchorRef
  sources?: { label: string; kind?: string }[]
}

/** A key output/deliverable surfaced from the conversation. */
export interface AnalysisKeyOutput {
  label: string
  detail: string
  anchor: AnchorRef
}

/** A source referenced in the conversation. */
export interface AnalysisSource {
  label: string
  kind?: string
}

/** The structured analysis attached to a conversation doc. */
export interface AiConversationAnalysis {
  tldr: string
  chapters: AnalysisChapter[]
  keyOutputs: AnalysisKeyOutput[]
  sources: AnalysisSource[]
  model?: string
  generatedAt?: string
  schemaVersion?: number
}

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
  analysis?: AiConversationAnalysis
}
