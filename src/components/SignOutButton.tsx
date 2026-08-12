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

/**
 * Sign out and go straight back to the sign-in screen, where Google's account
 * chooser is now always shown (see lib/firebase.ts). Separate from Sign out
 * because the intent is different: someone switching accounts wants to come
 * back, and should not be left looking at a signed-out screen wondering whether
 * they have just locked themselves out.
 */
export function SwitchAccountButton({
  className = DEFAULT_CLASS,
  children = 'Switch account',
}: {
  className?: string
  children?: React.ReactNode
}) {
  const router = useRouter()

  async function handleSwitch() {
    await signOut(auth)
    router.replace('/login?switch=1')
  }

  return (
    <button type="button" onClick={handleSwitch} className={className}>
      {children}
    </button>
  )
}
