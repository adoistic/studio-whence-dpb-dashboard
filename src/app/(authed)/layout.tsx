'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser, useAllowStatus } from '@/lib/auth'
import { Topbar } from '@/components/Topbar'
import { Footer } from '@/components/Footer'
import { Eyebrow } from '@/components/Eyebrow'
import { loadContent } from '@/lib/content'

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, loading } = useUser()
  const status = useAllowStatus(user, loading)
  const content = loadContent()

  // redirects run as effects (never during render)
  useEffect(() => {
    if (loading || status === 'loading') return
    if (!user) { router.replace('/login'); return }
    if (status === 'pending') { router.replace('/pending') }
  }, [loading, status, user, router])

  // gate the UI
  if (loading || status === 'loading') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-brand-pale-dusk">
        <Eyebrow>Checking access</Eyebrow>
      </main>
    )
  }
  if (!user || status === 'pending') {
    // redirect is in flight; render the same quiet placeholder (do NOT render children)
    return (
      <main className="min-h-screen flex items-center justify-center bg-brand-pale-dusk">
        <Eyebrow>Checking access</Eyebrow>
      </main>
    )
  }
  // admin or allow
  return (
    <>
      <Topbar />
      {children}
      <Footer sha={content.source_sha} lastUpdate={content.generated_at} />
    </>
  )
}
