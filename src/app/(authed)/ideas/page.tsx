'use client'

import { useUser, useAllowStatus, canModerate } from '@/lib/auth'
import { useInboxIdeas, useIdeaReads } from '@/lib/ideas'
import { IdeaComposer } from '@/components/ideas/IdeaComposer'
import { IdeaInbox } from '@/components/ideas/IdeaInbox'

export default function IdeasPage() {
  const { user, loading } = useUser()
  const role = useAllowStatus(user, loading)
  const email = (user?.email ?? '').trim().toLowerCase()
  const name = user?.displayName ?? email

  const { data: ideas, loading: ideasLoading } = useInboxIdeas(role, email)
  const seen = useIdeaReads(email)

  return (
    <main className="mx-auto max-w-[1200px] px-6 pb-24 pt-12">
      <div className="mb-10">
        <span className="flex items-center gap-3">
          <span aria-hidden className="block h-px w-7 bg-brand-gold" />
          <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">
            Ideas · Inbox
          </span>
        </span>
        <h1 className="mt-4 font-serif font-light leading-tight text-brand-umber text-[2rem] md:text-[2.8rem]">
          Ideas
        </h1>
        <p className="mt-2 max-w-xl font-serif text-brand-umber/70 leading-relaxed">
          Drop a quick idea, share it with the team, and triage what comes in.
        </p>
      </div>

      {canModerate(role) && (
        <div className="mb-8">
          <IdeaComposer role={role} author={{ email, name }} />
        </div>
      )}

      {ideasLoading ? (
        <p role="status" className="font-serif text-sm text-brand-umber/60">
          Loading ideas…
        </p>
      ) : (
        <IdeaInbox ideas={ideas} seen={seen} role={role} viewerEmail={email} />
      )}
    </main>
  )
}
