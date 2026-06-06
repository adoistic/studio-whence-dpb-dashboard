'use client'

import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'

const DEFAULT_CLASS =
  'font-sans text-[0.7rem] uppercase tracking-label text-brand-slate transition-colors hover:text-brand-indigo'

export function SignOutButton({
  className = DEFAULT_CLASS,
  children = 'Sign out',
}: {
  className?: string
  children?: React.ReactNode
}) {
  const router = useRouter()

  async function handleSignOut() {
    await signOut(auth)
    router.replace('/login')
  }

  return (
    <button type="button" onClick={handleSignOut} className={className}>
      {children}
    </button>
  )
}
