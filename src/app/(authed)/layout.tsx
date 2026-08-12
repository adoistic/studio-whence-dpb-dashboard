'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useUser, useAllowStatus } from '@/lib/auth'
import { useLines } from '@/lib/catalog'
import { useActiveSurface, useAvailableSurfaces } from '@/lib/surface'
import { Topbar } from '@/components/Topbar'
import { FooterWithData } from '@/components/FooterWithData'
import { Eyebrow } from '@/components/Eyebrow'
import { SignOutButton } from '@/components/SignOutButton'

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading } = useUser()
  const status = useAllowStatus(user, loading)

  // The comics / manga fork. A person with both is asked once, on their first
  // visit in this browser, and never again — so a deep link to a title always
  // opens that title rather than bouncing through a chooser.
  const { data: lines } = useLines()
  const { data: availableSurfaces } = useAvailableSurfaces(status, user?.email ?? null, lines ?? null)
  const { surface: activeSurface, ready: surfaceReady, setSurface } = useActiveSurface()

  // redirects run as effects (never during render).
  // Note: 'suspended' does NOT redirect — it renders a terminal message below,
  // so a suspended user can't get stuck in a redirect loop.
  useEffect(() => {
    if (loading || status === 'loading') return
    if (!user) { router.replace('/login'); return }
    if (status === 'pending') { router.replace('/pending') }
  }, [loading, status, user, router])

  useEffect(() => {
    if (!surfaceReady || !availableSurfaces || availableSurfaces.length === 0) return
    // Exactly one surface: adopt it silently and show no fork at all.
    if (availableSurfaces.length === 1) {
      if (activeSurface !== availableSurfaces[0]) setSurface(availableSurfaces[0])
      return
    }
    // A stored choice that is still valid stands.
    if (activeSurface && availableSurfaces.includes(activeSurface)) return
    if (pathname !== '/choose') router.replace('/choose')
  }, [surfaceReady, availableSurfaces, activeSurface, pathname, router, setSurface])

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
