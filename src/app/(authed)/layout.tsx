'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser, useAllowStatus } from '@/lib/auth'
import { Topbar } from '@/components/Topbar'
import { FooterWithData } from '@/components/FooterWithData'
import { Eyebrow } from '@/components/Eyebrow'
import { ContentProvider } from '@/lib/content'

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, loading } = useUser()
  const status = useAllowStatus(user, loading)

  // redirects run as effects (never during render)
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
  if (!user || status === 'pending') {
    // redirect is in flight; render the same quiet placeholder (do NOT render children)
    return checkingAccessScreen
  }
  // admin or allow
  return (
    <ContentProvider>
      <Topbar />
      {children}
      <FooterWithData />
    </ContentProvider>
  )
}
