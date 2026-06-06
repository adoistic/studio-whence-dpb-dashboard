'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser, useAllowStatus } from '@/lib/auth'
import { Topbar } from '@/components/Topbar'
import { FooterWithData } from '@/components/FooterWithData'
import { Eyebrow } from '@/components/Eyebrow'
import { SignOutButton } from '@/components/SignOutButton'

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, loading } = useUser()
  const status = useAllowStatus(user, loading)

  // redirects run as effects (never during render).
  // Note: 'suspended' does NOT redirect — it renders a terminal message below,
  // so a suspended user can't get stuck in a redirect loop.
  useEffect(() => {
    if (loading || status === 'loading') return
    if (!user) { router.replace('/login'); return }
    if (status === 'pending') { router.replace('/pending') }
  }, [loading, status, user, router])

  const checkingAccessScreen = (
    <main className="min-h-screen flex items-center justify-center bg-brand-pale-dusk">
      <div role="status">
        <Eyebrow>Checking access</Eyebrow>
      </div>
    </main>
  )

  // gate the UI
  if (loading || status === 'loading') {
    return checkingAccessScreen
  }
  if (status === 'suspended') {
    // Terminal state — no redirect (avoids a loop). Clear message instead.
    return (
      <main className="min-h-screen flex items-center justify-center bg-brand-pale-dusk px-6">
        <div role="alert" className="max-w-md text-center">
          <Eyebrow>Access suspended</Eyebrow>
          <p className="mt-3 text-brand-ink/80">
            Your access has been suspended. Contact the administrator.
          </p>
          {/* A suspended user is otherwise stuck — give them a way to log out. */}
          <div className="mt-6">
            <SignOutButton />
          </div>
        </div>
      </main>
    )
  }
  if (!user || status === 'pending') {
    // redirect is in flight; render the same quiet placeholder (do NOT render children)
    return checkingAccessScreen
  }
  // admin, sub_admin, or allow
  // NOTE: the old ContentProvider mount (which fetched the FULL catalog via
  // /content for every authed user) was removed — pages read Firestore via
  // catalog.ts (B2.7 cutover), so nothing consumes that context anymore.
  return (
    <>
      <Topbar />
      {children}
      <FooterWithData />
    </>
  )
}
