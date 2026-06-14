'use client'

import { useEffect, useState } from 'react'
import {
  signInWithPopup,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { auth, googleProvider } from '@/lib/firebase'
import { useUser } from '@/lib/auth'
import { BrandLockup } from '@/components/BrandLockup'
import { DiamondBooksLogo } from '@/components/DiamondBooksLogo'
import { Eyebrow } from '@/components/Eyebrow'

export default function LoginPage() {
  const router = useRouter()
  const { user, loading } = useUser()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState(false)

  // Email-link states
  const [email, setEmail] = useState('')
  const [sendingLink, setSendingLink] = useState(false)
  const [linkSent, setLinkSent] = useState(false)

  // Redirect if already signed in.
  useEffect(() => {
    if (!loading && user) {
      router.replace('/')
    }
  }, [user, loading, router])

  // Complete email-link sign-in when the user returns via the link.
  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return

    let storedEmail = window.localStorage.getItem('emailForSignIn')
    if (!storedEmail) {
      storedEmail =
        window.prompt('Confirm your email to finish signing in') || ''
    }
    if (!storedEmail) return

    setSigningIn(true)
    setError(false)
    signInWithEmailLink(auth, storedEmail, window.location.href)
      .then(() => {
        window.localStorage.removeItem('emailForSignIn')
        router.replace('/')
      })
      .catch(() => {
        setError(true)
        setSigningIn(false)
      })
  }, [router])

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

  async function handleEmailLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return

    setSendingLink(true)
    setError(false)
    try {
      const actionCodeSettings = {
        url: `${window.location.origin}/login`,
        handleCodeInApp: true,
      }
      await sendSignInLinkToEmail(auth, email, actionCodeSettings)
      window.localStorage.setItem('emailForSignIn', email)
      setLinkSent(true)
    } catch {
      setError(true)
    } finally {
      setSendingLink(false)
    }
  }

  const busy = signingIn || sendingLink

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

      <div className="flex flex-col items-center gap-4 w-full max-w-xs">
        {/* Primary: Google */}
        <button
          onClick={handleSignIn}
          disabled={busy}
          aria-label="Sign in with Google"
          className="
            w-full
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

        {/* Divider */}
        <div className="flex items-center gap-3 w-full" aria-hidden="true">
          <span className="flex-1 border-t border-brand-pale-dusk opacity-60" />
          <span className="font-sans text-xs text-brand-lavender uppercase tracking-label">
            or
          </span>
          <span className="flex-1 border-t border-brand-pale-dusk opacity-60" />
        </div>

        {/* Secondary: email link */}
        {linkSent ? (
          <p className="text-sm font-serif text-brand-indigo text-center" role="status">
            Check your email for a sign-in link.
          </p>
        ) : (
          <form onSubmit={handleEmailLink} className="flex flex-col gap-2 w-full">
            <label
              htmlFor="email-input"
              className="font-sans text-xs uppercase tracking-label text-brand-slate"
            >
              Email
            </label>
            <input
              id="email-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@thothica.com"
              disabled={busy}
              className="
                font-serif text-sm text-brand-indigo
                bg-white
                border border-brand-pale-dusk rounded-brand
                px-4 py-2.5
                placeholder:text-brand-lavender
                focus:outline-none focus:ring-1 focus:ring-brand-indigo
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            />
            <button
              type="submit"
              disabled={busy}
              className="
                font-sans text-xs uppercase tracking-label text-brand-indigo
                self-start mt-1
                transition-opacity duration-200 ease-out
                hover:opacity-70
                disabled:opacity-40 disabled:cursor-not-allowed
              "
            >
              {sendingLink ? 'Sending…' : 'Email me a sign-in link →'}
            </button>
          </form>
        )}

        {error && (
          <p className="text-xs font-sans text-brand-slate" role="alert">
            Sign-in failed. Try again.
          </p>
        )}
      </div>

      {/* Co-brand: Studio Whence produces the Diamond Pocket Books / Diamond
          Toons comic lines for Diamond (the client) — credit reads "Produced for". */}
      <div className="flex flex-col items-center gap-2.5">
        <span className="font-sans text-[0.65rem] uppercase tracking-label text-brand-lavender">
          Produced for
        </span>
        <DiamondBooksLogo width={132} />
      </div>
    </main>
  )
}
