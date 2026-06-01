'use client'

import { useEffect, useState } from 'react'
import { signInWithPopup } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { auth, googleProvider } from '@/lib/firebase'
import { useUser } from '@/lib/auth'
import { BrandLockup } from '@/components/BrandLockup'
import { Eyebrow } from '@/components/Eyebrow'

export default function LoginPage() {
  const router = useRouter()
  const { user, loading } = useUser()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState(false)

  // Redirect if already signed in.
  useEffect(() => {
    if (!loading && user) {
      router.replace('/')
    }
  }, [user, loading, router])

  async function handleSignIn() {
    setSigningIn(true)
    setError(false)
    try {
      await signInWithPopup(auth, googleProvider)
      router.replace('/')
    } catch {
      setError(true)
      setSigningIn(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 bg-brand-pale-dusk px-6">
      <BrandLockup size="lg" />

      <div className="flex flex-col items-center gap-3 text-center">
        <Eyebrow>Studio access</Eyebrow>

        <h1 className="text-3xl font-serif font-light text-brand-indigo mt-1">
          Sign in to continue
        </h1>

        <p className="text-sm font-serif text-brand-lavender">
          dpb.studiowhence.com — restricted access
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          aria-label="Sign in with Google"
          className="
            bg-brand-indigo text-brand-pale-dusk
            font-sans text-xs uppercase tracking-label
            rounded-brand
            px-7 py-3
            transition-opacity duration-200 ease-out
            hover:opacity-85
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {signingIn ? 'Signing in…' : 'Sign in with Google'}
        </button>

        {error && (
          <p className="text-xs font-sans text-brand-slate" role="alert">
            Sign-in failed. Try again.
          </p>
        )}
      </div>
    </main>
  )
}
