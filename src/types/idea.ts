import type { Timestamp } from 'firebase/firestore'

export type Visibility = 'private' | 'all_sub_admins' | 'all_approved' | 'specific'
export type IdeaStatus = 'new' | 'triaged' | 'actioned' | 'archived'

/** A larger/attached image stored in R2 (not inline base64). */
export interface R2Image {
  token: string        // the `r2:<key>` token used in bodyMarkdown
  key: string          // images/ideas/<ideaId>/<filename>
  filename: string
  contentType: string
}

export interface Idea {
  id: string
  author: string       // normalized email
  authorName: string
  title?: string
  bodyMarkdown: string // canonical; may embed sanitized HTML + data: URIs + r2: tokens
  r2Images: R2Image[]
  visibility: Visibility
  recipients: string[] // emails; meaningful only when visibility === 'specific'
  status: IdeaStatus
  tags: string[]
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  editedAt: Timestamp | null
}

/** Per-user read-state doc at idea_reads/{email}. */
export interface IdeaReads {
  seen: Record<string, boolean> // ideaId -> true
}
