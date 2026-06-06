'use client'

import { useEffect } from 'react'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useUser } from '@/lib/auth'
import { BrandLockup } from '@/components/BrandLockup'
import { Eyebrow } from '@/components/Eyebrow'
import { SignOutButton } from '@/components/SignOutButton'

export default function PendingPage() {
  const { user } = useUser()
  const email = user?.email ?? null

  useEffect(() => {
    if (!email) return

    let cancelled = false

    setDoc(doc(db, 'access_requests', email), {
      requested_at: serverTimestamp(),
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      resolved: false,
      resolution: null,
    }).catch(() => {
      // Swallow — the message is shown regardless; network/rules failures
      // must not block the user from seeing the awaiting screen.
    })

    return () => {
      cancelled = true
      void cancelled // suppress unused warning
    }
  }, [email])

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 bg-brand-pale-dusk px-6">
      <BrandLockup size="lg" />

      <div className="flex flex-col items-center gap-3 text-center">
        <Eyebrow>Awaiting access</Eyebrow>

        <h1 className="text-3xl font-serif font-light text-brand-indigo mt-1">
          Access pending
        </h1>

        <p className="text-base font-serif text-brand-umber">
          {"You're awaiting access. Adnan has been notified."}
        </p>

        {!email && (
          <p className="text-xs font-sans text-brand-slate mt-2">
            Not signed in?{' '}
            <a href="/login" className="underline underline-offset-2">
              Sign in
            </a>{' '}
            to register your request.
          </p>
        )}

        {/* A signed-in user awaiting access still needs a way out — to switch
            accounts or simply log off — so always surface Sign out here. */}
        {email && (
          <div className="mt-2">
            <SignOutButton />
          </div>
        )}
      </div>
    </main>
  )
}
